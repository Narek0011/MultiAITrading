import { buildAiStatus } from './ai-status';

const base = {
  botEnabled: true,
  scanIntervalMinutes: 15,
  analysesToday: 42,
  pairsMonitored: 17,
  stats: { total: 9, winRate: 67, open: 2, wins: 6, losses: 3, pips: 120, today: 1 } as any,
  now: Date.parse('2026-10-23T12:00:00Z'),
};

describe('buildAiStatus', () => {
  it('is live right after a scan', () => {
    const s = buildAiStatus({ ...base, lastScanAt: new Date('2026-10-23T11:55:00Z') });
    expect(s).toEqual({ state: 'live', lastScanAt: '2026-10-23T11:55:00.000Z', analysesToday: 42, pairsMonitored: 17, signalsTotal: 9, winRate: 67 });
  });

  it('is standby when enabled but no recent scan (outside sessions)', () => {
    expect(buildAiStatus({ ...base, lastScanAt: new Date('2026-10-23T08:00:00Z') }).state).toBe('standby');
    expect(buildAiStatus({ ...base, lastScanAt: null }).state).toBe('standby');
  });

  it('is offline when the bot is disabled', () => {
    expect(buildAiStatus({ ...base, botEnabled: false, lastScanAt: new Date() }).state).toBe('offline');
  });

  it('never exposes open trades, levels or the strategy mode', () => {
    const s = buildAiStatus({ ...base, lastScanAt: null }) as unknown as Record<string, unknown>;
    expect(Object.keys(s).sort()).toEqual(['analysesToday', 'lastScanAt', 'pairsMonitored', 'signalsTotal', 'state', 'winRate']);
  });
});
