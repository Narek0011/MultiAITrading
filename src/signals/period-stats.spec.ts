import { ClosedSignal, periodStart, summarise } from './period-stats';

let t = 0;
const sig = (pair: string, status: string, tp1Hit: boolean, pips = 0): ClosedSignal => ({ pair, direction: 'BUY', status, tp1Hit, closedAt: new Date(Date.UTC(2026, 10, 1) + ++t * 60_000), pips });
const win = (pair = 'EUR/USD') => sig(pair, 'WIN', true);
const loss = (pair = 'EUR/USD') => sig(pair, 'LOSS', false);

describe('period stats', () => {
  it('counts wins and losses like the dashboard (TP1 or WIN = win, SL/LOSS without TP1 = loss, flat expiry = neither)', () => {
    const s = summarise('7d', [win(), sig('GBP/USD', 'BE', true, 12), sig('GBP/USD', 'SL', false, -20), loss(), sig('USD/JPY', 'EXPIRED', false)]);
    expect([s.wins, s.losses, s.neutral, s.winRate, s.pips]).toEqual([2, 2, 1, 50, -8]);
  });

  it('finds the longest run of wins; a flat expiry does not break it', () => {
    const s = summarise('all', [win(), loss(), win(), win(), sig('EUR/USD', 'EXPIRED', false), win(), loss(), win()]);
    expect(s.bestStreak).toBe(3);
  });

  it('ranks top pairs by win rate, only pairs with 2+ closed signals', () => {
    const s = summarise('30d', [win('GBP/CAD'), win('GBP/CAD'), win('EUR/USD'), win('EUR/USD'), loss('EUR/USD'), win('USD/JPY'), loss('AUD/USD'), loss('AUD/USD')]);
    expect(s.topPairs.map((p) => `${p.pair} ${p.winRate}`)).toEqual(['GBP/CAD 100', 'EUR/USD 67']);
  });

  it('lists the latest results with wins first', () => {
    const s = summarise('today', [win('A/B'), loss('C/D'), win('E/F')]);
    expect(s.recent.map((r) => `${r.pair}:${r.win}`)).toEqual(['E/F:true', 'A/B:true', 'C/D:false']);
  });

  it('starts periods at UTC midnight', () => {
    const now = new Date('2026-11-06T15:30:00Z');
    expect(periodStart('today', now)?.toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(periodStart('7d', now)?.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(periodStart('30d', now)?.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(periodStart('all', now)).toBeNull();
  });
});
