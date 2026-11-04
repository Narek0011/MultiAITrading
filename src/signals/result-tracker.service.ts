import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { toPips } from '../common/forex';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { SignalLang, Timeframe } from '../settings/settings.types';
import { telegramText } from '../telegram/messages';
import { TelegramService } from '../telegram/telegram.service';
import { ActivityLogService } from './activity-log.service';
import { evaluateSignal, expiryOutcome, ResultEvent } from './result-evaluator';
import { Signal } from './signal.entity';

const TF_MS: Record<Timeframe, number> = {
  '1min': 60_000,
  '5min': 5 * 60_000,
  '15min': 15 * 60_000,
  '30min': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

/** A live price is used to settle an expiry signal if the check runs this soon after expiry; later, the 1-min candle at expiry. */
const LIVE_PRICE_WINDOW_MS = 2 * 60_000;

/** Follows open signals and reports TP / SL hits as replies to the original Telegram post. */
@Injectable()
export class ResultTrackerService {
  constructor(
    @InjectRepository(Signal) private readonly repo: Repository<Signal>,
    private readonly settings: SettingsService,
    private readonly market: TwelveDataService,
    private readonly telegram: TelegramService,
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

  /**
   * Settles expiry-style signals whose expiration has passed: WIN if price moved the signalled way, LOSS if against,
   * EXPIRED on an exact tie. Nothing is posted to Telegram. Runs every minute so results close on time.
   */
  async settleExpired() {
    const open = await this.repo.find({ where: { closedAt: IsNull(), style: 'expiry' }, order: { createdAt: 'ASC' } });
    const now = Date.now();
    for (const s of open) {
      const expiresAt = s.createdAt.getTime() + (s.expiryMinutes ?? 1) * 60_000;
      if (now < expiresAt) continue;
      try {
        let price: number | null = null;
        if (now - expiresAt < LIVE_PRICE_WINDOW_MS) price = await this.market.getPrice(s.pair);
        else {
          const minutes = Math.ceil((now - expiresAt) / 60_000) + 3;
          const candles = await this.market.getCandles(s.pair, '1min', Math.min(5000, minutes));
          // The candle that was open at the moment of expiry, else the last one before it.
          price = [...candles].reverse().find((c) => c.time <= expiresAt)?.close ?? null;
        }
        if (price == null) continue;
        const outcome = expiryOutcome(s.direction, s.entry, price);
        s.status = outcome;
        s.tp1Hit = outcome === 'WIN';
        s.closedAt = new Date();
        await this.repo.save(s);
        this.log.add(outcome === 'LOSS' ? 'warn' : 'success', `${s.pair} #${s.id}: ${outcome} at expiry (${s.entry} → ${price})`);
      } catch (err: any) {
        this.log.add('warn', `Expiry result ${s.pair} #${s.id}: ${err.message}`);
      }
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
    if (!this.settings.get('telegram').postResults) return;
    // Reply in every channel the signal went to; signals from before multi-channel only have telegramMessageId.
    const targets = s.posts?.length
      ? s.posts.filter((p) => p.messageId).map((p) => ({ chatId: p.chatId, messageId: p.messageId!, language: p.language }))
      : s.telegramMessageId
        ? [{ chatId: undefined, messageId: s.telegramMessageId, language: this.settings.get('general').signalLanguage }]
        : [];
    for (const target of targets) {
      try {
        await this.telegram.sendMessage(`${textIn(target.language)}\n<b>${s.direction} ${s.pair}</b>`, target.messageId, target.chatId);
      } catch (err: any) {
        this.log.add('warn', `Could not post ${event} for ${s.pair}${target.chatId ? ` in ${target.chatId}` : ''}: ${err.message}`);
      }
    }
  }

}
