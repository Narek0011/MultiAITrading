export type StatsPeriod = 'today' | '7d' | '30d' | 'all';
export const STATS_PERIODS: StatsPeriod[] = ['today', '7d', '30d', 'all'];

/** The fields of a closed signal the summary needs. */
export interface ClosedSignal {
  pair: string;
  direction: 'BUY' | 'SELL';
  status: string;
  tp1Hit: boolean;
  closedAt: Date;
  pips: number;
}

export interface PeriodStats {
  period: StatsPeriod;
  wins: number;
  losses: number;
  /** Closed with neither a win nor a loss (expired flat, exact tie). */
  neutral: number;
  winRate: number | null;
  pips: number;
  /** Longest run of wins in a row (by close time). */
  bestStreak: number;
  topPairs: { pair: string; wins: number; total: number; winRate: number }[];
  /** Latest closed signals, wins first. */
  recent: { pair: string; direction: 'BUY' | 'SELL'; win: boolean }[];
}

/** Start of the period (UTC), or null for all time. */
export function periodStart(period: StatsPeriod, now = new Date()): Date | null {
  if (period === 'all') return null;
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  if (period === '7d') d.setUTCDate(d.getUTCDate() - 6);
  if (period === '30d') d.setUTCDate(d.getUTCDate() - 29);
  return d;
}

/** A win is any signal that reached TP1 (or won at expiry); a loss is SL/LOSS without TP1. */
export const isWin = (s: { tp1Hit: boolean }) => s.tp1Hit;
export const isLoss = (s: { status: string; tp1Hit: boolean }) => (s.status === 'SL' || s.status === 'LOSS') && !s.tp1Hit;

export function summarise(period: StatsPeriod, signals: ClosedSignal[]): PeriodStats {
  const sorted = [...signals].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  const wins = sorted.filter(isWin).length;
  const losses = sorted.filter(isLoss).length;

  let bestStreak = 0;
  let run = 0;
  for (const s of sorted) {
    if (isWin(s)) bestStreak = Math.max(bestStreak, ++run);
    else if (isLoss(s)) run = 0;
  }

  const byPair = new Map<string, { wins: number; total: number }>();
  for (const s of sorted) {
    if (!isWin(s) && !isLoss(s)) continue;
    const p = byPair.get(s.pair) ?? { wins: 0, total: 0 };
    p.total++;
    if (isWin(s)) p.wins++;
    byPair.set(s.pair, p);
  }
  const topPairs = [...byPair.entries()]
    .filter(([, p]) => p.total >= 2 && p.wins > 0)
    .map(([pair, p]) => ({ pair, ...p, winRate: Math.round((p.wins / p.total) * 100) }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)
    .slice(0, 3);

  const latest = sorted.filter((s) => isWin(s) || isLoss(s)).slice(-8).reverse();
  const recent = [...latest.filter(isWin), ...latest.filter((s) => !isWin(s))].map((s) => ({ pair: s.pair, direction: s.direction, win: isWin(s) }));

  return {
    period,
    wins,
    losses,
    neutral: sorted.length - wins - losses,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
    pips: Math.round(sorted.reduce((sum, s) => sum + s.pips, 0)),
    bestStreak,
    topPairs,
    recent,
  };
}
