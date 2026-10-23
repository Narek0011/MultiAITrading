import { ATR, EMA, MACD, RSI } from 'technicalindicators';
import { Candle } from '../common/types';

export interface IndicatorParams {
  rsiPeriod: number;
  emaFast: number;
  emaSlow: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atrPeriod: number;
}

export interface IndicatorSeries {
  emaFast: (number | null)[];
  emaSlow: (number | null)[];
  rsi: (number | null)[];
  macdHist: (number | null)[];
  atr: (number | null)[];
}

/** Pads an indicator output on the left so index i lines up with candle i. */
function align(values: number[], length: number): (number | null)[] {
  return [...Array(Math.max(0, length - values.length)).fill(null), ...values];
}

export function computeIndicators(candles: Candle[], p: IndicatorParams): IndicatorSeries {
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const n = candles.length;
  const macd = MACD.calculate({
    values: close,
    fastPeriod: p.macdFast,
    slowPeriod: p.macdSlow,
    signalPeriod: p.macdSignal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  return {
    emaFast: align(EMA.calculate({ period: p.emaFast, values: close }), n),
    emaSlow: align(EMA.calculate({ period: p.emaSlow, values: close }), n),
    rsi: align(RSI.calculate({ period: p.rsiPeriod, values: close }), n),
    macdHist: align(macd.map((m) => m.histogram ?? 0), n),
    atr: align(ATR.calculate({ period: p.atrPeriod, high, low, close }), n),
  };
}

export const last = <T>(arr: (T | null)[], offset = 0): T | null => arr[arr.length - 1 - offset] ?? null;

/** Compact snapshot handed to the AI and shown in admin previews. */
export function indicatorSnapshot(candles: Candle[], s: IndicatorSeries) {
  const r = (v: number | null, d = 5) => (v == null ? null : Number(v.toFixed(d)));
  const closes = candles.slice(-50);
  return {
    lastClose: candles[candles.length - 1].close,
    emaFast: r(last(s.emaFast)),
    emaSlow: r(last(s.emaSlow)),
    rsi: r(last(s.rsi), 1),
    rsiPrev: r(last(s.rsi, 1), 1),
    macdHistogram: r(last(s.macdHist), 6),
    macdHistogramPrev: r(last(s.macdHist, 1), 6),
    atr: r(last(s.atr), 6),
    recentHigh: Math.max(...closes.map((c) => c.high)),
    recentLow: Math.min(...closes.map((c) => c.low)),
  };
}
