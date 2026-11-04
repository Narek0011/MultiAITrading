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
import { StrategyMode, Timeframe } from '../settings/settings.types';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { expiryCaption, signalCaption } from '../telegram/messages';
import { TelegramApiError, TelegramService } from '../telegram/telegram.service';
import { ActivityLogService } from './activity-log.service';
import { Signal } from './signal.entity';

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

    try {
      signal.telegramMessageId = await this.post(signal, png);
      await this.repo.save(signal);
      this.log.add('success', `${pair.symbol}: ${idea.direction} posted (${idea.confidence}%)`);
    } catch (err: any) {
      signal.error = err.message;
      await this.repo.save(signal);
      this.log.add('error', `${pair.symbol}: signal saved but Telegram failed — ${err.message}`);
    }
  }

  private async post(signal: Signal, png?: Buffer) {
    const g = this.settings.get('general');
    const tg = this.settings.get('telegram');
    if (signal.style === 'expiry') {
      const banner = await fs.readFile(join(BANNERS_DIR, signal.direction === 'BUY' ? 'up.jpg' : 'down.jpg'));
      const input = { pair: signal.pair, direction: signal.direction, confidence: signal.confidence, expiryMinutes: signal.expiryMinutes ?? g.expiryMinutes };
      const caption = expiryCaption(input, g.signalLanguage, { showConfidence: tg.showConfidence, emoji: tg });
      try {
        return await this.telegram.sendPhoto(banner, caption, undefined, 'jpeg');
      } catch (err) {
        // Custom emoji only work for bots with a username bought on Fragment — fall back to normal emoji.
        if (!(err instanceof TelegramApiError) || !caption.includes('<tg-emoji')) throw err;
        this.log.add('warn', `Custom emoji rejected by Telegram (${err.message}) — posted with normal emoji`);
        return this.telegram.sendPhoto(banner, expiryCaption(input, g.signalLanguage, { showConfidence: tg.showConfidence, useCustomEmoji: false }), undefined, 'jpeg');
      }
    }
    const caption = signalCaption({ ...signal, timeframe: signal.timeframe as Timeframe }, g.signalLanguage, tg);
    return tg.sendChart && png ? this.telegram.sendPhoto(png, caption) : this.telegram.sendMessage(caption);
  }

  /**
   * Posts a fake sample signal with the current style, language and emoji settings so the admin can see how it looks.
   * Nothing is saved and nothing is tracked; the chart (forex style) is drawn from made-up candles.
   */
  async sendTest(): Promise<{ pair: string; direction: 'BUY' | 'SELL'; style: string }> {
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
    await this.post(signal, png);
    this.log.add('info', `Test signal posted (${signal.style}, ${direction} ${pair}, ${g.signalLanguage})`);
    return { pair, direction, style: signal.style };
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
    signal.telegramMessageId = await this.post(signal, png);
    signal.error = null;
    await this.repo.save(signal);
    this.log.add('success', `${signal.pair}: signal #${id} re-sent`);
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

export function resultPips(s: Signal): number {
  if (s.style === 'expiry') return 0;
  if (s.status === 'TP2') return toPips(s.pair, Math.abs(s.takeProfit2 - s.entry));
  if (s.tp1Hit) return toPips(s.pair, Math.abs(s.takeProfit1 - s.entry));
  if (s.status === 'SL') return -toPips(s.pair, Math.abs(s.entry - s.stopLoss));
  return 0;
}
