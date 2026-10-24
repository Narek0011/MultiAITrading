import { Session, Timeframe } from '../settings/settings.types';
import { Candle } from './types';

export const isJpyPair = (pair: string) => pair.endsWith('/JPY');
export const priceDigits = (pair: string) => (isJpyPair(pair) ? 3 : 5);
export const pipSize = (pair: string) => (isJpyPair(pair) ? 0.01 : 0.0001);
export const formatPrice = (pair: string, value: number) => value.toFixed(priceDigits(pair));
export const toPips = (pair: string, distance: number) => Math.round((distance / pipSize(pair)) * 10) / 10;
export const roundPrice = (pair: string, value: number) => Number(value.toFixed(priceDigits(pair)));

export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  '5min': 'M5',
  '15min': 'M15',
  '30min': 'M30',
  '1h': 'H1',
  '4h': 'H4',
};

/** One step up, used as trend context for the AI strategy. */
export const HIGHER_TIMEFRAME: Record<Timeframe, Timeframe> = {
  '5min': '30min',
  '15min': '1h',
  '30min': '4h',
  '1h': '4h',
  '4h': '4h',
};

/** Session opening hours in UTC, [start, end) — wraps past midnight when start > end. */
export const SESSION_HOURS: Record<Session, [number, number]> = {
  sydney: [21, 6],
  tokyo: [0, 9],
  london: [7, 16],
  newyork: [12, 21],
};

export function isInSessions(sessions: Session[], date = new Date()): boolean {
  if (!sessions.length) return true;
  const h = date.getUTCHours();
  return sessions.some((s) => {
    const [start, end] = SESSION_HOURS[s];
    return start < end ? h >= start && h < end : h >= start || h < end;
  });
}

/** Forex is closed from Friday 21:00 UTC until Sunday 21:00 UTC. */
export function isMarketClosed(date = new Date()): boolean {
  const day = date.getUTCDay();
  const h = date.getUTCHours();
  return day === 6 || (day === 5 && h >= 21) || (day === 0 && h < 21);
}

/** Bars that fit in one weekend close (48h) — fetched on top so weekend gaps still leave a full window. */
export const WEEKEND_BARS: Record<Timeframe, number> = {
  '5min': 576,
  '15min': 192,
  '30min': 96,
  '1h': 48,
  '4h': 12,
};

/** Drops bars opened while the market was closed — weekend feeds are flat quote noise that squash the chart. */
export function dropClosedCandles(candles: Candle[]): Candle[] {
  return candles.filter((c) => !isMarketClosed(new Date(c.time)));
}
