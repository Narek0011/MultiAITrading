import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AnalysisService } from '../analysis/analysis.service';
import { ChartRendererService } from '../charts/chart-renderer.service';
import { isInSessions, isMarketClosed, toPips } from '../common/forex';
import { Pair } from '../pairs/pair.entity';
import { PairsService } from '../pairs/pairs.service';
import { SettingsService } from '../settings/settings.service';
import { StrategyMode, Timeframe } from '../settings/settings.types';
import { signalCaption } from '../telegram/messages';
import { TelegramService } from '../telegram/telegram.service';
import { ActivityLogService } from './activity-log.service';
import { Signal } from './signal.entity';

export const CHARTS_DIR = join(process.cwd(), 'storage', 'charts');

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
    const result = await this.analysis.analyze(pair.symbol);
    this.countAnalysis();
    const { idea, mode } = result;
    const min = this.analysis.minConfidence(mode);
    if (idea.direction === 'NONE') {
      this.log.add('info', `${pair.symbol}: no trade — ${idea.reasoning.slice(0, 140)}`);
      return false;
    }
    if (idea.confidence < min) {
      this.log.add('info', `${pair.symbol}: ${idea.direction} skipped, confidence ${idea.confidence}% < ${min}%`);
      return false;
    }

    const g = this.settings.get('general');
    const custom = this.settings.get('custom');
    const signal = this.repo.create({
      pair: pair.symbol,
      direction: idea.direction,
      entry: idea.entry,
      stopLoss: idea.stopLoss,
      takeProfit1: idea.takeProfit1,
      takeProfit2: idea.takeProfit2,
      confidence: idea.confidence,
      reasoning: idea.reasoning,
      mode,
      timeframe: g.timeframe,
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
    return true;
  }

  private post(signal: Signal, png?: Buffer) {
    const g = this.settings.get('general');
    const tg = this.settings.get('telegram');
    const caption = signalCaption({ ...signal, timeframe: signal.timeframe as Timeframe }, g.signalLanguage, tg);
    return tg.sendChart && png ? this.telegram.sendPhoto(png, caption) : this.telegram.sendMessage(caption);
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
    const losses = closed.filter((s) => s.status === 'SL' && !s.tp1Hit).length;
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
      where: { closedAt: Not(IsNull()), status: In(['TP1', 'TP2', 'BE']), tp1Hit: true },
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

export function resultPips(s: Signal): number {
  if (s.status === 'TP2') return toPips(s.pair, Math.abs(s.takeProfit2 - s.entry));
  if (s.tp1Hit) return toPips(s.pair, Math.abs(s.takeProfit1 - s.entry));
  if (s.status === 'SL') return -toPips(s.pair, Math.abs(s.entry - s.stopLoss));
  return 0;
}
