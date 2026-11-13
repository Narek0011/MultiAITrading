import { Candle } from '../common/types';

export type ResultEvent = 'TP1' | 'TP2' | 'SL' | 'BE';

export interface TrackedSignal {
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  tp1Hit: boolean;
}

/**
 * Walks candles (oldest first) that formed after the signal and returns what happened.
 * When one candle touches both the stop and a target we assume the stop came first, so
 * reported results are never better than reality.
 */
export function evaluateSignal(s: TrackedSignal, candles: Candle[], breakevenAfterTp1: boolean) {
  const events: ResultEvent[] = [];
  let tp1Hit = s.tp1Hit;
  let closed = false;
  const buy = s.direction === 'BUY';
  const reached = (c: Candle, level: number) => (buy ? c.high >= level : c.low <= level);
  const stopped = (c: Candle, level: number) => (buy ? c.low <= level : c.high >= level);

  for (const c of candles) {
    const stop = tp1Hit && breakevenAfterTp1 ? s.entry : s.stopLoss;
    if (stopped(c, stop)) {
      events.push(tp1Hit && breakevenAfterTp1 ? 'BE' : 'SL');
      closed = true;
      break;
    }
    if (!tp1Hit && reached(c, s.takeProfit1)) {
      tp1Hit = true;
      events.push('TP1');
    }
    if (tp1Hit && reached(c, s.takeProfit2)) {
      events.push('TP2');
      closed = true;
      break;
    }
  }
  return { events, tp1Hit, closed };
}

/** Result of an expiry-style signal: did price close the signalled way at expiration? An exact tie is a refund. */
export function expiryOutcome(direction: 'BUY' | 'SELL', entry: number, priceAtExpiry: number): 'WIN' | 'LOSS' | 'EXPIRED' {
  if (priceAtExpiry === entry) return 'EXPIRED';
  return (direction === 'BUY') === priceAtExpiry > entry ? 'WIN' : 'LOSS';
}

/**
 * Best estimate of the price at instant `at` from 1-min candles (oldest first): the open of the minute it falls in
 * when that is closer, else the close. Null when the minute isn't in the data or hasn't finished yet.
 */
export function priceAt(candles: Candle[], at: number, now = Date.now()): number | null {
  const c = candles.find((k) => k.time <= at && at < k.time + 60_000);
  if (!c) return null;
  if (at - c.time < 30_000) return c.open;
  return now >= c.time + 60_000 ? c.close : null;
}
