import { Candle } from '../common/types';
import { closedCandles, DEFAULT_EXPIRY_PARAMS, expirySetup, resample15 } from './expiry.strategy';

const PIP = 0.0001;
const T0 = Date.UTC(2026, 10, 10, 8, 0);

/** 1-min candles: a steady trend of `drift` pips/min with small wiggles, then `tail` moves (in pips) as the last candles. */
function series(drift: number, tail: number[], count = 1200): Candle[] {
  const out: Candle[] = [];
  let price = 1.1;
  const moves = [...Array.from({ length: count - tail.length }, (_, i) => drift + Math.sin(i / 3) * 1.2), ...tail];
  moves.forEach((m, i) => {
    const open = price;
    const close = open + m * PIP;
    out.push({ time: T0 + i * 60_000, open, close, high: Math.max(open, close) + 0.4 * PIP, low: Math.min(open, close) - 0.4 * PIP });
    price = close;
  });
  return out;
}

describe('expirySetup', () => {
  it('BUY: uptrend, pullback on 1 min, then a candle resuming up', () => {
    const r = expirySetup('EUR/USD', series(0.3, [-1.5, -2, -2.5, -1.5, -0.5, 2.5]));
    expect(r.direction).toBe('BUY');
    expect(r.confidence).toBeGreaterThanOrEqual(55);
    expect(r.confidence).toBeLessThanOrEqual(85);
  });

  it('SELL: the mirror image', () => {
    const r = expirySetup('EUR/USD', series(-0.3, [1.5, 2, 2.5, 1.5, 0.5, -2.5]));
    expect(r.direction).toBe('SELL');
  });

  it('NONE while the pullback is still going', () => {
    expect(expirySetup('EUR/USD', series(0.3, [-1.5, -2, -2.5, -1.5, -0.5, -2])).direction).toBe('NONE');
  });

  it('NONE without a trend (flat market)', () => {
    expect(expirySetup('EUR/USD', series(0, [-1.5, -2, -2.5, -1.5, -0.5, 2.5])).direction).toBe('NONE');
  });

  it('NONE when the market is too quiet', () => {
    const r = expirySetup('EUR/USD', series(0.3, [-1.5, -2, -2.5, -1.5, -0.5, 2.5]), { ...DEFAULT_EXPIRY_PARAMS, minAtrPips: 10 });
    expect(r).toMatchObject({ direction: 'NONE', reasons: [expect.stringContaining('too quiet')] });
  });
});

describe('candle helpers', () => {
  it('resample15 builds complete 15-min candles and drops the forming one', () => {
    const m1 = series(0.3, [], 40); // 2 full buckets + 10 minutes
    const m15 = resample15(m1);
    expect(m15).toHaveLength(2);
    expect(m15[0]).toMatchObject({ time: T0, open: m1[0].open, close: m1[14].close });
    expect(m15[1].high).toBe(Math.max(...m1.slice(15, 30).map((c) => c.high)));
  });

  it('closedCandles leaves out the candle still forming', () => {
    const m1 = series(0.3, [], 5);
    expect(closedCandles(m1, 60_000, T0 + 4 * 60_000 + 30_000)).toHaveLength(4);
    expect(closedCandles(m1, 60_000, T0 + 5 * 60_000)).toHaveLength(5);
  });
});
