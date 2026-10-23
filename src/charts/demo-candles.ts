import { Candle } from '../common/types';

/** Deterministic, realistic-looking random walk used for the landing sample chart and tests. */
export function demoCandles(count = 160, start = 1.0842, stepMs = 15 * 60_000, seed = 7): Candle[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const candles: Candle[] = [];
  let price = start;
  const t0 = Date.UTC(2026, 9, 22, 6, 0) - count * stepMs;
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 22) * 0.00012 + (i > count * 0.7 ? 0.00007 : 0);
    const open = price;
    const close = open + drift + (rand() - 0.5) * 0.0009;
    const high = Math.max(open, close) + rand() * 0.00035;
    const low = Math.min(open, close) - rand() * 0.00035;
    candles.push({ time: t0 + i * stepMs, open, high, low, close });
    price = close;
  }
  return candles;
}
