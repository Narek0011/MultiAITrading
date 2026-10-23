import { isInSessions, isMarketClosed } from './forex';

describe('forex sessions', () => {
  it('handles sessions that wrap past midnight', () => {
    expect(isInSessions(['sydney'], new Date('2026-10-21T23:00:00Z'))).toBe(true);
    expect(isInSessions(['sydney'], new Date('2026-10-21T10:00:00Z'))).toBe(false);
    expect(isInSessions(['london', 'newyork'], new Date('2026-10-21T14:00:00Z'))).toBe(true);
    expect(isInSessions([], new Date('2026-10-21T03:00:00Z'))).toBe(true);
  });

  it('knows when the market is closed', () => {
    expect(isMarketClosed(new Date('2026-10-24T12:00:00Z'))).toBe(true); // Saturday
    expect(isMarketClosed(new Date('2026-10-23T21:30:00Z'))).toBe(true); // Friday late
    expect(isMarketClosed(new Date('2026-10-25T21:30:00Z'))).toBe(false); // Sunday open
    expect(isMarketClosed(new Date('2026-10-21T10:00:00Z'))).toBe(false); // Wednesday
  });
});
