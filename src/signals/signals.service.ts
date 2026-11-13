import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AnalysisResult, AnalysisService } from '../analysis/analysis.service';
import { ChartRendererService } from '../charts/chart-renderer.service';
import { isInSessions, isMarketClosed, pipSize, toPips } from '../common/forex';
import { Candle } from '../common/types';
import { computeIndicators } from '../analysis/indicators';
import { Pair } from '../pairs/pair.entity';
import { PairsService } from '../pairs/pairs.service';
import { SettingsService } from '../settings/settings.service';
import { SignalLang, StrategyMode, Timeframe } from '../settings/settings.types';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { expiryCaption, signalCaption } from '../telegram/messages';
import { ChannelSender } from '../telegram/channel-sender.service';
import { ActivityLogService } from './activity-log.service';
import { ResultTrackerService } from './result-tracker.service';
import { periodStart, StatsPeriod, summarise } from './period-stats';
import { pickBest } from './pick-best';
import { Signal, SignalPost } from './signal.entity';
import { activeSignalChannels } from '../telegram/signal-channels';

export const CHARTS_DIR = join(process.cwd(), 'storage', 'charts');
/** UP / DOWN banners posted with expiry-style signals. */
const BANNERS_DIR = join(process.cwd(), 'assets', 'signals');

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

@Injectable()
export class SignalsService {
  private scanning = false;
  lastScanAt: Date | null = null;
  /** Pair analyses run by scans today (UTC) — shown on the public landing page. */
  private analyses = { day: '', count: 0 };

  constructor(
    @InjectRepository(Signal) private readonly repo: Repository<Signal>,
    private readonly settings: SettingsService,
    private readonly pairs: PairsService,
    private readonly analysis: AnalysisService,
    private readonly charts: ChartRendererService,
    private readonly sender: ChannelSender,
    private readonly market: TwelveDataService,
    private readonly log: ActivityLogService,
    private readonly tracker: ResultTrackerService,
  ) {}

  get isScanning() {
    return this.scanning;
  }

  get analysesToday() {
    return this.analyses.day === new Date().toISOString().slice(0, 10) ? this.analyses.count : 0;
  }

  private countAnalysis() {
    const day = new Date().toISOString().slice(0, 10);
    if (this.analyses.day !== day) this.analyses = { day, count: 0 };
    this.analyses.count++;
  }

  /**
   * One full pass over all enabled pairs.
   * `manual` runs ignore the on/off switch and session filters (used by "Run scan now"), but never post on a closed market.
   */
  async scan(manual = false): Promise<{ posted: number; skipped?: string }> {
    if (this.scanning) return { posted: 0, skipped: 'A scan is already running' };
    const g = this.settings.get('general');
    if ((manual || g.skipWeekends) && isMarketClosed()) return { posted: 0, skipped: 'Forex market is closed (weekend)' };
    if (!manual) {
      if (!g.botEnabled) return { posted: 0, skipped: 'Bot is disabled' };
      if (!isInSessions(g.sessions)) return { posted: 0, skipped: 'Outside selected trading sessions' };
    }

    this.scanning = true;
    let posted = 0;
    try {
      const pairs = await this.pairs.enabled();
      this.log.add('info', `Scan started (${g.mode === 'AI' ? 'AI' : 'Custom'} mode, ${pairs.length} pairs, ${g.timeframe})`);
      for (const pair of pairs) {
        const todayCount = await this.repo.count({ where: { createdAt: MoreThanOrEqual(startOfUtcDay()) } });
        if (todayCount >= g.maxSignalsPerDay) {
          this.log.add('warn', `Daily limit of ${g.maxSignalsPerDay} signals reached — scan stopped`);
          break;
        }
        const blocked = await this.blockedReason(pair);
        if (blocked) continue;
        try {
          if (await this.processPair(pair)) posted++;
        } catch (err: any) {
          this.log.add('error', `${pair.symbol}: ${err.message}`);
        }
      }
      this.log.add('info', `Scan finished — ${posted} signal(s) posted`);
    } finally {
      this.scanning = false;
      this.lastScanAt = new Date();
    }
    return { posted };
  }

  /** Signals created since `since` (used by the time schedule to see whether a slot is already filled). */
  countSince(since: Date) {
    return this.repo.count({ where: { createdAt: MoreThanOrEqual(since) } });
  }

  /** Custom-mode expiry signals: decided on fresh 1-min candles, re-checked just before posting, never posted below the minimum. */
  private get strictExpiry() {
    const g = this.settings.get('general');
    return g.mode === 'CUSTOM' && g.signalStyle === 'expiry';
  }

  /** Rough time a full scan of the enabled pairs takes at the market-data rate limit (used to start scans early). */
  async estimatedScanMs() {
    const rpm = Math.max(1, this.settings.get('marketData').requestsPerMinute);
    return ((await this.pairs.enabled()).length + 1) * Math.ceil(60_000 / rpm);
  }

  /**
   * Scheduled-time run: analyse every eligible pair, then post only the `limit` best ideas by confidence.
   * Sessions are ignored (the admin picked the times), the daily cap still applies.
   * With `publishAt` (scan started early), posting waits until then.
   */
  async scanBest(limit: number, opts: { floor?: number; publishAt?: Date } = {}): Promise<{ posted: number; skipped?: string }> {
    const skipped = await this.scanBlocked();
    if (skipped) return { posted: 0, skipped };
    const g = this.settings.get('general');
    const left = g.maxSignalsPerDay - (await this.countSince(startOfUtcDay()));

    this.scanning = true;
    let posted = 0;
    try {
      const pairs = await this.pairs.enabled();
      this.log.add('info', `Scheduled signal scan started (${g.mode === 'AI' ? 'AI' : 'Custom'} mode, ${pairs.length} pairs, ${this.strictExpiry ? '1min setup + 15min trend' : g.timeframe})`);
      const candidates: { pair: Pair; result: AnalysisResult }[] = [];
      for (const pair of pairs) {
        if (await this.blockedReason(pair)) continue;
        try {
          const result = await this.evaluate(pair, opts.floor);
          if (result) candidates.push({ pair, result });
        } catch (err: any) {
          this.log.add('error', `${pair.symbol}: ${err.message}`);
        }
      }
      const ranked = candidates.map((c) => ({ ...c, confidence: c.result.idea.confidence, mode: c.result.mode }));
      const want = Math.min(limit, left);
      // Confirmed just before posting, so keep the rest as backups in case a pick's setup is gone by then.
      const { picks, belowMin } = pickBest(ranked, this.strictExpiry ? ranked.length : want, (mode) => this.analysis.minConfidence(mode as StrategyMode));
      if (belowMin) this.log.add('info', `No setup reached the min confidence — posting the best one (${picks[0].pair.symbol} ${picks[0].confidence}%)`);
      if (picks.length && opts.publishAt) await sleepUntil(opts.publishAt.getTime() - 5_000);
      for (const pick of picks) {
        if (posted >= want) break;
        try {
          const result = this.strictExpiry ? await this.confirm(pick.pair, pick.result) : pick.result;
          if (!result) continue;
          await this.publish(pick.pair, result);
          posted++;
        } catch (err: any) {
          this.log.add('error', `${pick.pair.symbol}: ${err.message}`);
        }
      }
      this.log.add('info', `Scheduled signal scan finished — ${candidates.length} qualifying, ${posted} posted`);
    } finally {
      this.scanning = false;
      this.lastScanAt = new Date();
    }
    return { posted };
  }

  /** Why a scheduled best-signal run can't post right now, or null. */
  async scanBlocked(): Promise<string | null> {
    const g = this.settings.get('general');
    if (this.scanning) return 'A scan is already running';
    if (isMarketClosed()) return 'Forex market is closed (weekend)';
    if (!g.botEnabled) return 'Bot is disabled';
    if ((await this.countSince(startOfUtcDay())) >= g.maxSignalsPerDay) return `Daily limit of ${g.maxSignalsPerDay} signals reached`;
    return null;
  }

  private async blockedReason(pair: Pair): Promise<string | null> {
    const g = this.settings.get('general');
    if (pair.lastSignalAt && Date.now() - pair.lastSignalAt.getTime() < g.pairCooldownMinutes * 60_000) return 'cooldown';
    if (g.onePerPairWhileOpen) {
      const open = await this.repo.exists({ where: { pair: pair.symbol, closedAt: IsNull() } });
      if (open) return 'open signal';
    }
    return null;
  }

  private async processPair(pair: Pair): Promise<boolean> {
    const result = await this.evaluate(pair);
    if (!result) return false;
    await this.publish(pair, result);
    return true;
  }

  /** Re-analyses a picked pair on the latest candles right before posting; null when the setup is gone. */
  private async confirm(pair: Pair, picked: AnalysisResult): Promise<AnalysisResult | null> {
    const fresh = await this.analysis.analyze(pair.symbol, picked.mode, { priority: true });
    const min = this.analysis.minConfidence(fresh.mode);
    if (fresh.idea.direction === picked.idea.direction && fresh.idea.confidence >= min) return fresh;
    this.log.add('info', `${pair.symbol}: ${picked.idea.direction} dropped — setup gone on the latest candles (${fresh.idea.reasoning.slice(0, 100)})`);
    return null;
  }

  /** Analyse a pair; returns the result only when it is a trade that passes the confidence threshold (or `floor`, when given). */
  private async evaluate(pair: Pair, floor?: number): Promise<AnalysisResult | null> {
    const result = await this.analysis.analyze(pair.symbol);
    this.countAnalysis();
    const { idea, mode } = result;
    const min = this.analysis.minConfidence(mode);
    // Custom expiry setups are already graded; a weak one is skipped, never posted as "the best of the rest".
    if (this.strictExpiry) floor = undefined;
    if (idea.direction === 'NONE') {
      this.log.add('info', `${pair.symbol}: no trade — ${idea.reasoning.slice(0, 140)}`);
      return null;
    }
    if (idea.confidence < Math.min(min, floor ?? min)) {
      this.log.add('info', `${pair.symbol}: ${idea.direction} skipped, confidence ${idea.confidence}% < ${min}%`);
      return null;
    }
    return result;
  }

  private async publish(pair: Pair, result: AnalysisResult) {
    const { idea, mode } = result;
    if (idea.direction === 'NONE') return;
    const g = this.settings.get('general');
    const custom = this.settings.get('custom');
    const expiry = g.signalStyle === 'expiry';
    // An expiry signal is settled against the price at posting time; the analysed price may be minutes old after a full scan.
    const entry = expiry ? await this.entryPrice(pair.symbol, result) : idea.entry;
    const signal = this.repo.create({
      pair: pair.symbol,
      direction: idea.direction,
      entry,
      stopLoss: idea.stopLoss,
      takeProfit1: idea.takeProfit1,
      takeProfit2: idea.takeProfit2,
      confidence: idea.confidence,
      reasoning: idea.reasoning,
      mode,
      timeframe: result.timeframe,
      style: expiry ? 'expiry' : 'forex',
      expiryMinutes: expiry ? Math.max(1, Math.round(g.expiryMinutes)) : null,
    });

    const png = this.charts.renderPng({
      pair: pair.symbol,
      timeframe: result.timeframe,
      candles: result.candles,
      indicators: result.indicators,
      emaLabels: [`EMA ${custom.emaFast}`, `EMA ${custom.emaSlow}`],
      signal: { ...idea, direction: idea.direction },
    });
    await fs.mkdir(CHARTS_DIR, { recursive: true });
    signal.imageFile = `${pair.symbol.replace('/', '')}-${Date.now()}.png`;
    await fs.writeFile(join(CHARTS_DIR, signal.imageFile), png);
    await this.repo.save(signal);
    await this.pairs.touch(pair.id);

    await this.postAndRecord(signal, png);
    if (expiry) this.tracker.scheduleSettle(signal);
    if (signal.telegramMessageId) this.log.add('success', `${pair.symbol}: ${idea.direction} posted (${idea.confidence}%) to ${okCount(signal.posts)} channel(s)`);
    else this.log.add('error', `${pair.symbol}: signal saved but Telegram failed — ${signal.error}`);
  }

  /** Live price for an expiry entry: the quote from the confirming fetch when seconds old, else a priority /price call. */
  private async entryPrice(symbol: string, result: AnalysisResult) {
    if (result.quote && Date.now() - result.quote.at < 15_000) return result.quote.price;
    return this.market.getPrice(symbol, { priority: true }).catch(() => result.quote?.price ?? result.idea.entry);
  }

  /** Posts to every active channel and stores where it went (one failing channel doesn't stop the others). */
  private async postAndRecord(signal: Signal, png?: Buffer) {
    try {
      signal.posts = await this.post(signal, png);
    } catch (err: any) {
      signal.posts = [];
      signal.error = err.message;
      signal.telegramMessageId = null;
      return this.repo.save(signal);
    }
    const failed = signal.posts.filter((p) => p.error);
    signal.telegramMessageId = signal.posts.find((p) => p.messageId)?.messageId ?? null;
    signal.error = failed.length ? failed.map((p) => `${p.channel}: ${p.error}`).join('; ') : null;
    failed.forEach((p) => this.log.add('error', `${signal.pair}: posting to channel "${p.channel}" failed — ${p.error}`));
    return this.repo.save(signal);
  }

  /** Sends the signal to each active channel, in that channel's language. */
  private async post(signal: Signal, png?: Buffer): Promise<SignalPost[]> {
    const g = this.settings.get('general');
    const channels = activeSignalChannels(this.settings.get('telegram'), g.signalLanguage);
    if (!channels.length) throw new Error('No signals channel set (Admin → Telegram)');
    const banner = signal.style === 'expiry' ? await fs.readFile(join(BANNERS_DIR, signal.direction === 'BUY' ? 'up.jpg' : 'down.jpg')) : undefined;
    const posts: SignalPost[] = [];
    for (const ch of channels) {
      const post: SignalPost = { channel: ch.key, chatId: ch.chatId, language: ch.language, messageId: null };
      try {
        post.messageId = await this.sendTo(signal, ch.chatId, ch.language, banner ?? png, !!banner);
        // The expiration runs from when the signal first reached a channel, as it does for the people trading it.
        if (signal.style === 'expiry' && !signal.expiresAt && post.messageId) signal.expiresAt = new Date(Date.now() + (signal.expiryMinutes ?? 1) * 60_000);
      } catch (err: any) {
        post.error = err.message;
      }
      posts.push(post);
    }
    return posts;
  }

  private async sendTo(signal: Signal, chatId: string, lang: SignalLang, image: Buffer | undefined, isBanner: boolean) {
    const g = this.settings.get('general');
    const tg = this.settings.get('telegram');
    if (signal.style === 'expiry' && image) {
      const input = { pair: signal.pair, direction: signal.direction, confidence: signal.confidence, expiryMinutes: signal.expiryMinutes ?? g.expiryMinutes };
      return this.sender.sendPhoto(image, expiryCaption(input, lang, { showConfidence: tg.showConfidence, emoji: tg }), chatId, 'jpeg');
    }
    // The AI writes its analysis in one language, so it is shown only in channels of that language.
    const caption = signalCaption({ ...signal, timeframe: signal.timeframe as Timeframe }, lang, { ...tg, showReasoning: tg.showReasoning && lang === g.signalLanguage });
    return tg.sendChart && image && !isBanner ? this.sender.sendPhoto(image, caption, chatId) : this.sender.sendMessage(caption, undefined, chatId);
  }

  /**
   * Posts a fake sample signal with the current style, language and emoji settings so the admin can see how it looks.
   * Nothing is saved and nothing is tracked; the chart (forex style) is drawn from made-up candles.
   */
  async sendTest(): Promise<{ pair: string; direction: 'BUY' | 'SELL'; style: string; sent: string[]; failed: string[] }> {
    const g = this.settings.get('general');
    const custom = this.settings.get('custom');
    const risk = this.settings.get('risk');
    const pair = (await this.pairs.enabled())[0]?.symbol ?? 'EUR/USD';
    const direction = Math.random() < 0.5 ? 'BUY' : 'SELL';
    const candles = sampleCandles(pair, direction, g.timeframe);
    const entry = candles[candles.length - 1].close;
    const atr = Math.abs(candles[candles.length - 1].high - candles[candles.length - 1].low) * 3;
    const sign = direction === 'BUY' ? 1 : -1;
    const idea = {
      direction,
      entry,
      stopLoss: entry - sign * atr * risk.slAtrMultiplier,
      takeProfit1: entry + sign * atr * risk.slAtrMultiplier * risk.tp1RiskReward,
      takeProfit2: entry + sign * atr * risk.slAtrMultiplier * risk.tp2RiskReward,
      confidence: 79,
      reasoning: 'Test signal — sample data, not a trade.',
    } as const;
    const signal = this.repo.create({
      ...idea,
      pair,
      mode: g.mode,
      timeframe: g.timeframe,
      style: g.signalStyle === 'expiry' ? 'expiry' : 'forex',
      expiryMinutes: Math.max(1, Math.round(g.expiryMinutes)),
    });
    const png =
      signal.style === 'forex'
        ? this.charts.renderPng({
            pair,
            timeframe: g.timeframe,
            candles,
            indicators: computeIndicators(candles, { ...custom, atrPeriod: risk.atrPeriod }),
            emaLabels: [`EMA ${custom.emaFast}`, `EMA ${custom.emaSlow}`],
            signal: idea,
          })
        : undefined;
    const posts = await this.post(signal, png);
    const sent = posts.filter((p) => p.messageId).map((p) => `${p.channel} (${p.language})`);
    const failed = posts.filter((p) => p.error).map((p) => `${p.channel}: ${p.error}`);
    if (!sent.length) throw new Error(`Test signal not sent — ${failed.join('; ')}`);
    this.log.add('info', `Test signal posted (${signal.style}, ${direction} ${pair}) to ${sent.join(', ')}`);
    failed.forEach((f) => this.log.add('error', `Test signal failed — ${f}`));
    return { pair, direction, style: signal.style, sent, failed };
  }

  /** Analyse one pair and render its chart without posting anything. */
  async preview(pairId: number, mode?: StrategyMode) {
    const pair = await this.pairs.get(pairId);
    const g = this.settings.get('general');
    const custom = this.settings.get('custom');
    const result = await this.analysis.analyze(pair.symbol, mode ?? g.mode);
    const { idea } = result;
    const png = this.charts.renderPng({
      pair: pair.symbol,
      timeframe: result.timeframe,
      candles: result.candles,
      indicators: result.indicators,
      emaLabels: [`EMA ${custom.emaFast}`, `EMA ${custom.emaSlow}`],
      signal: idea.direction === 'NONE' ? undefined : { ...idea, direction: idea.direction },
    });
    return {
      pair: pair.symbol,
      mode: result.mode,
      idea,
      minConfidence: this.analysis.minConfidence(result.mode),
      marketClosed: isMarketClosed(),
      chart: `data:image/png;base64,${png.toString('base64')}`,
    };
  }

  async resend(id: number) {
    const signal = await this.repo.findOneBy({ id });
    if (!signal) throw new NotFoundException('Signal not found');
    const png = signal.imageFile ? await fs.readFile(join(CHARTS_DIR, signal.imageFile)).catch(() => undefined) : undefined;
    await this.postAndRecord(signal, png);
    if (!signal.telegramMessageId) throw new Error(signal.error ?? 'Telegram failed');
    this.log.add('success', `${signal.pair}: signal #${id} re-sent to ${okCount(signal.posts)} channel(s)`);
    return signal;
  }

  async list(q: { status?: string; pair?: string; page?: number }) {
    const take = 25;
    const page = Math.max(1, Number(q.page) || 1);
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.pair) where.pair = q.pair;
    const [items, total] = await this.repo.findAndCount({ where, order: { createdAt: 'DESC' }, take, skip: (page - 1) * take });
    return { items, total, page, pages: Math.max(1, Math.ceil(total / take)) };
  }

  async get(id: number) {
    const s = await this.repo.findOneBy({ id });
    if (!s) throw new NotFoundException('Signal not found');
    return s;
  }

  async stats() {
    const closed = await this.repo.find({ where: { closedAt: Not(IsNull()) } });
    const wins = closed.filter((s) => s.tp1Hit).length;
    const losses = closed.filter((s) => (s.status === 'SL' || s.status === 'LOSS') && !s.tp1Hit).length;
    const pips = closed.reduce((sum, s) => sum + resultPips(s), 0);
    return {
      total: await this.repo.count(),
      today: await this.repo.count({ where: { createdAt: MoreThanOrEqual(startOfUtcDay()) } }),
      open: await this.repo.count({ where: { closedAt: IsNull() } }),
      wins,
      losses,
      winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
      pips: Math.round(pips),
    };
  }

  /** Wins, losses, streak and top pairs of signals closed in `period` (for the news statistics post). */
  async periodStats(period: StatsPeriod) {
    const from = periodStart(period);
    const closed = await this.repo.find({ where: { closedAt: from ? MoreThanOrEqual(from) : Not(IsNull()) } });
    const stats = summarise(period, closed.map((s) => ({ ...s, closedAt: s.closedAt!, pips: resultPips(s) })));
    if (!stats.wins && !stats.losses) throw new Error('No closed signals in this period yet');
    return stats;
  }

  /** Win rate of signals closed in the last `days`, split several ways, to see what actually works. */
  async breakdown(days: number) {
    const closed = await this.repo.find({ where: { closedAt: MoreThanOrEqual(new Date(Date.now() - days * 86_400_000)) } });
    const split = (key: (s: Signal) => string) => {
      const groups = new Map<string, { wins: number; losses: number; neutral: number }>();
      for (const s of closed) {
        const g = groups.get(key(s)) ?? { wins: 0, losses: 0, neutral: 0 };
        if (s.tp1Hit) g.wins++;
        else if (s.status === 'SL' || s.status === 'LOSS') g.losses++;
        else g.neutral++;
        groups.set(key(s), g);
      }
      return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([group, g]) => ({ group, ...g, winRate: g.wins + g.losses ? Math.round((g.wins / (g.wins + g.losses)) * 1000) / 10 : null }));
    };
    const band = (c: number) => `${Math.floor(c / 5) * 5}-${Math.floor(c / 5) * 5 + 4}%`;
    return {
      days,
      total: closed.length,
      byStyleMode: split((s) => `${s.style} ${s.mode} ${s.timeframe}`),
      byConfidence: split((s) => band(s.confidence)),
      byHourUtc: split((s) => `${String(s.createdAt.getUTCHours()).padStart(2, '0')}h`),
      byPair: split((s) => s.pair),
    };
  }

  /** Closed signals for the public landing page — never exposes open trades. */
  /** Latest closed signals that reached a take-profit (the landing table is titled accordingly). */
  async recentResults(limit = 8) {
    const rows = await this.repo.find({
      where: { closedAt: Not(IsNull()), status: In(['TP1', 'TP2', 'BE', 'WIN']), tp1Hit: true },
      order: { closedAt: 'DESC' },
      take: limit,
    });
    return rows.map((s) => ({
      pair: s.pair,
      direction: s.direction,
      status: s.status,
      win: s.tp1Hit,
      pips: Math.round(resultPips(s) * 10) / 10,
      closedAt: s.closedAt,
    }));
  }

  /** Most recent closed signal that has a chart image, for the landing sample card. */
  latestClosedChart() {
    return this.repo.findOne({ where: { closedAt: Not(IsNull()), imageFile: Not(IsNull()) }, order: { closedAt: 'DESC' } });
  }
}

/** Made-up candles drifting in `direction`, for test signals. */
function sampleCandles(pair: string, direction: 'BUY' | 'SELL', timeframe: Timeframe): Candle[] {
  const step = { '1min': 1, '5min': 5, '15min': 15, '30min': 30, '1h': 60, '4h': 240 }[timeframe] * 60_000;
  const pip = pipSize(pair);
  const drift = (direction === 'BUY' ? 1 : -1) * pip * 0.6;
  let price = pair.endsWith('/JPY') ? 150 : 1.1;
  const start = Math.floor(Date.now() / step) * step - 150 * step;
  return Array.from({ length: 150 }, (_, i) => {
    const open = price;
    const close = open + drift + (Math.random() - 0.5) * pip * 8;
    const high = Math.max(open, close) + Math.random() * pip * 3;
    const low = Math.min(open, close) - Math.random() * pip * 3;
    price = close;
    return { time: start + i * step, open, high, low, close };
  });
}

const sleepUntil = (at: number) => new Promise((r) => setTimeout(r, Math.max(0, at - Date.now())));

const okCount = (posts: SignalPost[]) => posts.filter((p) => p.messageId).length;

export function resultPips(s: Signal): number {
  if (s.style === 'expiry') return 0;
  if (s.status === 'TP2') return toPips(s.pair, Math.abs(s.takeProfit2 - s.entry));
  if (s.tp1Hit) return toPips(s.pair, Math.abs(s.takeProfit1 - s.entry));
  if (s.status === 'SL') return -toPips(s.pair, Math.abs(s.entry - s.stopLoss));
  return 0;
}
