import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { toPips } from '../common/forex';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { SignalLang, Timeframe } from '../settings/settings.types';
import { ChannelSender } from '../telegram/channel-sender.service';
import { expiryResultText, telegramText } from '../telegram/messages';
import { ActivityLogService } from './activity-log.service';
import { evaluateSignal, expiryOutcome, priceAt, ResultEvent } from './result-evaluator';
import { Signal } from './signal.entity';

const TF_MS: Record<Timeframe, number> = {
  '1min': 60_000,
  '5min': 5 * 60_000,
  '15min': 15 * 60_000,
  '30min': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

/**
 * Expiry signals are settled by a timer at the exact expiry with a live price. If that didn't happen (restart, API error),
 * the minute check settles them from the 1-min candle at expiry once it is this old.
 */
const RECOVERY_AFTER_MS = 2 * 60_000;

/** When an expiry signal settles: its stored expiry, or (older signals) creation time + expiry minutes. */
export const expiryTime = (s: Pick<Signal, 'expiresAt' | 'createdAt' | 'expiryMinutes'>) =>
  s.expiresAt?.getTime() ?? s.createdAt.getTime() + (s.expiryMinutes ?? 1) * 60_000;

/** Follows open signals and reports TP / SL hits as replies to the original Telegram post. */
@Injectable()
export class ResultTrackerService implements OnModuleInit, OnApplicationShutdown {
  private timers = new Map<number, NodeJS.Timeout>();
  /** Signals being settled right now, so the timer and the minute check never settle one twice. */
  private settling = new Set<number>();

  constructor(
    @InjectRepository(Signal) private readonly repo: Repository<Signal>,
    private readonly settings: SettingsService,
    private readonly market: TwelveDataService,
    private readonly sender: ChannelSender,
    private readonly log: ActivityLogService,
  ) {}

  async track() {
    const open = await this.repo.find({ where: { closedAt: IsNull(), style: Not('expiry') }, order: { createdAt: 'ASC' } });
    if (!open.length) return;

    const groups = new Map<string, Signal[]>();
    for (const s of open) {
      const key = `${s.pair}|${s.timeframe}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }

    for (const [key, signals] of groups) {
      const [pair, timeframe] = key.split('|') as [string, Timeframe];
      try {
        const tf = TF_MS[timeframe] ?? TF_MS['15min'];
        const needed = Math.ceil((Date.now() - signals[0].createdAt.getTime()) / tf) + 2;
        const candles = await this.market.getCandles(pair, timeframe, Math.min(5000, Math.max(5, needed)));
        for (const s of signals) await this.apply(s, candles.filter((c) => c.time >= s.createdAt.getTime()));
      } catch (err: any) {
        this.log.add('warn', `Result tracking ${pair}: ${err.message}`);
      }
    }
  }

  /** After a restart: put open expiry signals that haven't expired yet back on their timers. */
  async onModuleInit() {
    const open = await this.repo.find({ where: { closedAt: IsNull(), style: 'expiry' } });
    open.filter((s) => expiryTime(s) > Date.now()).forEach((s) => this.scheduleSettle(s));
  }

  onApplicationShutdown() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  /** Settles an expiry signal at its exact expiry with a live price (its request slot is reserved in advance). */
  scheduleSettle(s: Signal) {
    const at = expiryTime(s);
    this.market.reserve(at);
    clearTimeout(this.timers.get(s.id));
    this.timers.set(
      s.id,
      setTimeout(() => {
        this.timers.delete(s.id);
        void this.settleLive(s.id);
      }, Math.max(0, at - Date.now())),
    );
  }

  private async settleLive(id: number) {
    const s = await this.repo.findOneBy({ id });
    if (!s || s.closedAt) return;
    await this.settle(s, async () => this.market.getPrice(s.pair, { priority: true }));
  }

  /**
   * Recovery for expiry signals the timer didn't settle: WIN if price moved the signalled way, LOSS if against,
   * EXPIRED on an exact tie — priced from the 1-min candle at the moment of expiry. Runs every minute.
   */
  async settleExpired() {
    const open = await this.repo.find({ where: { closedAt: IsNull(), style: 'expiry' }, order: { createdAt: 'ASC' } });
    const now = Date.now();
    for (const s of open) {
      const at = expiryTime(s);
      if (now - at < RECOVERY_AFTER_MS) continue;
      await this.settle(s, async () => {
        const minutes = Math.ceil((now - at) / 60_000) + 3;
        const candles = await this.market.getCandles(s.pair, '1min', Math.min(5000, minutes));
        return priceAt(candles, at, now);
      });
    }
  }

  private async settle(s: Signal, priceAtExpiry: () => Promise<number | null>) {
    if (this.settling.has(s.id)) return;
    this.settling.add(s.id);
    try {
      const price = await priceAtExpiry();
      if (price == null || !Number.isFinite(price)) return;
      const outcome = expiryOutcome(s.direction, s.entry, price);
      s.status = outcome;
      s.tp1Hit = outcome === 'WIN';
      s.exitPrice = price;
      s.closedAt = new Date();
      await this.repo.save(s);
      const lateSec = Math.round((Date.now() - expiryTime(s)) / 1000);
      this.log.add(outcome === 'LOSS' ? 'warn' : 'success', `${s.pair} #${s.id}: ${outcome} at expiry (${s.entry} → ${price}, settled ${lateSec}s after expiry)`);
      await this.reply(s, outcome, (lang) => expiryResultText(outcome, s, price, lang));
    } catch (err: any) {
      this.log.add('warn', `Expiry result ${s.pair} #${s.id}: ${err.message}`);
    } finally {
      this.settling.delete(s.id);
    }
  }

  private async apply(s: Signal, candles: { time: number; open: number; high: number; low: number; close: number }[]) {
    const risk = this.settings.get('risk');
    const { events, tp1Hit, closed } = evaluateSignal(s, candles, risk.breakevenAfterTp1);

    for (const e of events) await this.announce(s, e);
    s.tp1Hit = tp1Hit;
    if (events.length) s.status = events[events.length - 1];
    if (closed) s.closedAt = new Date();

    const expired = !closed && Date.now() - s.createdAt.getTime() > risk.expiryHours * 3_600_000;
    if (expired) {
      s.closedAt = new Date();
      // A signal that already paid TP1 keeps that result; otherwise it simply expires.
      if (!s.tp1Hit) {
        s.status = 'EXPIRED';
        await this.announce(s, 'EXPIRED');
      }
    }
    if (events.length || s.closedAt) await this.repo.save(s);
  }

  private async announce(s: Signal, event: ResultEvent | 'EXPIRED') {
    const breakeven = this.settings.get('risk').breakevenAfterTp1;
    const pips = (level: number) => toPips(s.pair, Math.abs(level - s.entry));
    const textIn = (lang: SignalLang) => {
      const t = telegramText(lang);
      return {
        TP1: (breakeven ? t.tp1HitBe : t.tp1Hit)(pips(s.takeProfit1)),
        TP2: t.tp2Hit(pips(s.takeProfit2)),
        SL: t.slHit(pips(s.stopLoss)),
        BE: t.beHit,
        EXPIRED: t.expired,
      }[event];
    };
    this.log.add(event === 'SL' ? 'warn' : 'success', `${s.pair} #${s.id}: ${event}`);
    await this.reply(s, event, (lang) => `${textIn(lang)}\n<b>${s.direction} ${s.pair}</b>`);
  }

  /** Replies in every channel the signal went to, in that channel's language (when "Post results" is on). */
  private async reply(s: Signal, event: string, textIn: (lang: SignalLang) => string) {
    if (!this.settings.get('telegram').postResults) return;
    // Signals from before multi-channel only have telegramMessageId (posted to the main channel).
    const targets = s.posts?.length
      ? s.posts.filter((p) => p.messageId).map((p) => ({ chatId: p.chatId, messageId: p.messageId!, language: p.language }))
      : s.telegramMessageId
        ? [{ chatId: this.settings.get('telegram').channelId, messageId: s.telegramMessageId, language: this.settings.get('general').signalLanguage }]
        : [];
    for (const target of targets) {
      try {
        await this.sender.sendMessage(textIn(target.language), target.messageId, target.chatId);
      } catch (err: any) {
        this.log.add('warn', `Could not post ${event} for ${s.pair} in ${target.chatId}: ${err.message}`);
      }
    }
  }

}
