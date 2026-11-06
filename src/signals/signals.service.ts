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
import { TelegramApiError, TelegramService } from '../telegram/telegram.service';
import { TelegramUserService } from '../telegram/telegram-user.service';
import { ActivityLogService } from './activity-log.service';
import { periodStart, StatsPeriod, summarise } from './period-stats';
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
    private readonly telegram: TelegramService,
    private readonly tgUser: TelegramUserService,
    private readonly market: TwelveDataService,
    private readonly log: ActivityLogService,
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

  /**
   * Scheduled-time run: analyse every eligible pair, then post only the `limit` best ideas by confidence.
   * Sessions are ignored (the admin picked the times), the daily cap still applies.
   */
  async scanBest(limit: number): Promise<{ posted: number; skipped?: string }> {
    if (this.scanning) return { posted: 0, skipped: 'A scan is already running' };
    const g = this.settings.get('general');
    if (isMarketClosed()) return { posted: 0, skipped: 'Forex market is closed (weekend)' };
    if (!g.botEnabled) return { posted: 0, skipped: 'Bot is disabled' };
    const left = g.maxSignalsPerDay - (await this.countSince(startOfUtcDay()));
    if (left <= 0) return { posted: 0, skipped: `Daily limit of ${g.maxSignalsPerDay} signals reached` };

    this.scanning = true;
    let posted = 0;
    try {
      const pairs = await this.pairs.enabled();
      this.log.add('info', `Scheduled signal scan started (${g.mode === 'AI' ? 'AI' : 'Custom'} mode, ${pairs.length} pairs, ${g.timeframe})`);
      const candidates: { pair: Pair; result: AnalysisResult }[] = [];
      for (const pair of pairs) {
        if (await this.blockedReason(pair)) continue;
        try {
          const result = await this.evaluate(pair);
          if (result) candidates.push({ pair, result });
        } catch (err: any) {
          this.log.add('error', `${pair.symbol}: ${err.message}`);
        }
      }
      candidates.sort((a, b) => b.result.idea.confidence - a.result.idea.confidence);
      for (const { pair, result } of candidates.slice(0, Math.min(limit, left))) {
        try {
          await this.publish(pair, result);
          posted++;
        } catch (err: any) {
          this.log.add('error', `${pair.symbol}: ${err.message}`);
        }
      }
      this.log.add('info', `Scheduled signal scan finished — ${candidates.length} qualifying, ${posted} posted`);
    } finally {
      this.scanning = false;
      this.lastScanAt = new Date();
    }
    return { posted };
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

  /** Analyse a pair; returns the result only when it is a trade that passes the confidence threshold. */
  private async evaluate(pair: Pair): Promise<AnalysisResult | null> {
    const result = await this.analysis.analyze(pair.symbol);
    this.countAnalysis();
    const { idea, mode } = result;
    const min = this.analysis.minConfidence(mode);
    if (idea.direction === 'NONE') {
      this.log.add('info', `${pair.symbol}: no trade — ${idea.reasoning.slice(0, 140)}`);
      return null;
    }
    if (idea.confidence < min) {
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
    const entry = expiry ? await this.market.getPrice(pair.symbol).catch(() => idea.entry) : idea.entry;
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
      timeframe: g.timeframe,
      style: expiry ? 'expiry' : 'forex',
      expiryMinutes: expiry ? Math.max(1, Math.round(g.expiryMinutes)) : null,
    });

    const png = this.charts.renderPng({
      pair: pair.symbol,
      timeframe: g.timeframe,
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
    if (signal.telegramMessageId) this.log.add('success', `${pair.symbol}: ${idea.direction} posted (${idea.confidence}%) to ${okCount(signal.posts)} channel(s)`);
    else this.log.add('error', `${pair.symbol}: signal saved but Telegram failed — ${signal.error}`);
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
    const expiry = signal.style === 'expiry' && image;
    const input = { pair: signal.pair, direction: signal.direction, confidence: signal.confidence, expiryMinutes: signal.expiryMinutes ?? g.expiryMinutes };
    // The AI writes its analysis in one language, so it is shown only in channels of that language.
    const caption = expiry
      ? expiryCaption(input, lang, { showConfidence: tg.showConfidence, emoji: tg })
      : signalCaption({ ...signal, timeframe: signal.timeframe as Timeframe }, lang, { ...tg, showReasoning: tg.showReasoning && lang === g.signalLanguage });
    const withPhoto = expiry || (tg.sendChart && image && !isBanner);

    // A (Premium) user account can send custom emoji; if it fails the bot still posts the signal.
    if (this.tgUser.active) {
      try {
        return withPhoto ? await this.tgUser.sendPhoto(image!, caption, chatId, expiry ? 'jpeg' : 'png') : await this.tgUser.sendMessage(caption, undefined, chatId);
      } catch (err: any) {
        this.log.add('warn', `Posting from the Telegram account to ${chatId} failed (${err.message}) — posted by the bot instead`);
      }
    }
    if (!expiry) return withPhoto ? this.telegram.sendPhoto(image!, caption, chatId) : this.telegram.sendMessage(caption, undefined, chatId);
    try {
      return await this.telegram.sendPhoto(image, caption, chatId, 'jpeg');
    } catch (err) {
      // Custom emoji only work for bots with a username bought on Fragment — fall back to normal emoji.
      if (!(err instanceof TelegramApiError) || !caption.includes('<tg-emoji')) throw err;
      this.log.add('warn', `Custom emoji rejected by Telegram (${err.message}) — posted with normal emoji`);
      return this.telegram.sendPhoto(image, expiryCaption(input, lang, { showConfidence: tg.showConfidence, useCustomEmoji: false }), chatId, 'jpeg');
    }
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
      timeframe: g.timeframe,
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

const okCount = (posts: SignalPost[]) => posts.filter((p) => p.messageId).length;

export function resultPips(s: Signal): number {
  if (s.style === 'expiry') return 0;
  if (s.status === 'TP2') return toPips(s.pair, Math.abs(s.takeProfit2 - s.entry));
  if (s.tp1Hit) return toPips(s.pair, Math.abs(s.takeProfit1 - s.entry));
  if (s.status === 'SL') return -toPips(s.pair, Math.abs(s.entry - s.stopLoss));
  return 0;
}
