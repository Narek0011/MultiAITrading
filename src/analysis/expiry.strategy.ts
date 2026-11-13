import { ATR, EMA, MACD, RSI } from 'technicalindicators';
import { pipSize } from '../common/forex';
import { Candle } from '../common/types';

export interface ExpiryParams {
  /** 15-min EMAs that set the trend. */
  trendFast: number;
  trendSlow: number;
  /** 1-min RSI used to spot the pullback and its end. */
  rsiPeriod: number;
  /** BUY needs the 1-min RSI to have dipped below this (SELL: above 100 − this) within `lookback` candles. */
  pullbackRsi: number;
  lookback: number;
  atrPeriod: number;
  /** 1-min ATR band in pips: below it the market is too quiet to move in 5 min, above it too wild. */
  minAtrPips: number;
  maxAtrPips: number;
}

export const DEFAULT_EXPIRY_PARAMS: ExpiryParams = {
  trendFast: 21,
  trendSlow: 50,
  rsiPeriod: 7,
  pullbackRsi: 40,
  lookback: 5,
  atrPeriod: 14,
  minAtrPips: 0.5,
  maxAtrPips: 5,
};

export interface ExpirySetup {
  direction: 'BUY' | 'SELL' | 'NONE';
  /** 55–85: how clean the setup is (trend strength, pullback depth, resume candle). Not a win probability. */
  confidence: number;
  reasons: string[];
}

const M15 = 15 * 60_000;

/** 1-min candles → complete 15-min candles (a bucket still forming at the end is left out). */
export function resample15(m1: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of m1) {
    const start = Math.floor(c.time / M15) * M15;
    const cur = out[out.length - 1];
    if (cur && cur.time === start) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
    } else out.push({ time: start, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  const last = m1[m1.length - 1];
  if (out.length && last && last.time + 60_000 < out[out.length - 1].time + M15) out.pop();
  return out;
}

/** Candles whose period has finished by `now` (the forming one would change after the decision). */
export const closedCandles = (candles: Candle[], periodMs: number, now = Date.now()) => candles.filter((c) => c.time + periodMs <= now);

const lastOf = (a: number[], back = 0) => a[a.length - 1 - back];
const clip01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Trend-pullback setup for short expiries (~5 min), on CLOSED 1-min candles:
 *  1. 15-min trend: EMA fast above slow and rising (SELL: below and falling), price on that side of the slow EMA.
 *  2. 1-min volatility within the ATR band.
 *  3. The 1-min RSI pulled back against the trend in the last few candles and has turned back, the last candle
 *     closed in the trend direction and the MACD histogram turned the same way.
 * Anything less is NONE — a slot without a clean setup is skipped.
 */
export function expirySetup(pair: string, m1: Candle[], p: ExpiryParams = DEFAULT_EXPIRY_PARAMS): ExpirySetup {
  const none = (reason: string): ExpirySetup => ({ direction: 'NONE', confidence: 0, reasons: [reason] });
  const m15 = resample15(m1);
  if (m15.length < p.trendSlow + 2 || m1.length < 60) return none('Not enough candles');

  const closes15 = m15.map((c) => c.close);
  const fast = EMA.calculate({ period: p.trendFast, values: closes15 });
  const slow = EMA.calculate({ period: p.trendSlow, values: closes15 });
  const atr15 = lastOf(ATR.calculate({ period: p.atrPeriod, high: m15.map((c) => c.high), low: m15.map((c) => c.low), close: closes15 }));
  const price = m1[m1.length - 1].close;
  const f = lastOf(fast), fPrev = lastOf(fast, 1), s = lastOf(slow);
  const trend = f > s && f > fPrev && price > s ? 'BUY' : f < s && f < fPrev && price < s ? 'SELL' : null;
  if (!trend) return none('No clear 15-min trend');

  const closes = m1.map((c) => c.close);
  const atr = lastOf(ATR.calculate({ period: p.atrPeriod, high: m1.map((c) => c.high), low: m1.map((c) => c.low), close: closes }));
  const atrPips = atr / pipSize(pair);
  if (!(atrPips >= p.minAtrPips)) return none(`Market too quiet (1-min ATR ${atrPips.toFixed(1)} pips)`);
  if (atrPips > p.maxAtrPips) return none(`Market too wild (1-min ATR ${atrPips.toFixed(1)} pips)`);

  const rsi = RSI.calculate({ period: p.rsiPeriod, values: closes });
  const hist = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }).map((m) => m.histogram ?? 0);
  const r = lastOf(rsi), rPrev = lastOf(rsi, 1);
  const recent = rsi.slice(-1 - p.lookback, -1);
  const last = m1[m1.length - 1];
  const buy = trend === 'BUY';

  const extreme = buy ? Math.min(...recent) : Math.max(...recent);
  const pulledBack = buy ? extreme < p.pullbackRsi : extreme > 100 - p.pullbackRsi;
  if (!pulledBack) return none('No pullback on the 1-min chart');
  const turned = buy ? r > rPrev && r < 70 : r < rPrev && r > 30;
  const candleOk = buy ? last.close > last.open : last.close < last.open;
  const macdOk = buy ? lastOf(hist) > lastOf(hist, 1) : lastOf(hist) < lastOf(hist, 1);
  if (!turned || !candleOk || !macdOk) return none('Pullback has not turned yet');

  const trendScore = clip01(Math.abs(f - s) / (atr15 || Infinity) / 1.5);
  const depthScore = clip01((buy ? p.pullbackRsi - extreme : extreme - (100 - p.pullbackRsi)) / 20);
  const bodyScore = clip01(Math.abs(last.close - last.open) / atr);
  const confidence = Math.round(55 + 30 * ((trendScore + depthScore + bodyScore) / 3));
  const side = buy ? 'up' : 'down';
  return {
    direction: trend,
    confidence,
    reasons: [
      `15-min trend ${side} (EMA${p.trendFast} ${buy ? 'above' : 'below'} EMA${p.trendSlow})`,
      `1-min pullback ended (RSI${p.rsiPeriod} ${extreme.toFixed(0)} → ${r.toFixed(0)})`,
      `last candle and MACD turned ${side}`,
    ],
  };
}
