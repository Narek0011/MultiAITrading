import { everySlot, invalidSignalTimes, nextSignalTime, openSlot, parseSignalTimes } from './signal-schedule';

describe('signal schedule', () => {
  it('parses, normalises, dedupes and sorts times', () => {
    expect(parseSignalTimes('22:00, 15:00 9:30;15:00, 25:00, x')).toEqual(['09:30', '15:00', '22:00']);
    expect(invalidSignalTimes('15:00, 25:00, x')).toEqual(['25:00', 'x']);
  });

  const times = ['15:00', '18:00', '22:00'];

  it('opens a slot at its time and keeps it open for the window', () => {
    const slot = openSlot(new Date('2026-11-03T15:20:30Z'), 'UTC', times, 30);
    expect(slot?.time).toBe('15:00');
    expect(slot?.startedAt.toISOString()).toBe('2026-11-03T15:00:00.000Z');
    expect(openSlot(new Date('2026-11-03T15:30:00Z'), 'UTC', times, 30)).toBeNull();
    expect(openSlot(new Date('2026-11-03T14:59:00Z'), 'UTC', times, 30)).toBeNull();
  });

  it('cuts the window at the next time and treats 0 as one minute', () => {
    expect(openSlot(new Date('2026-11-03T18:05:00Z'), 'UTC', ['17:50', '18:00'], 60)?.time).toBe('18:00');
    expect(openSlot(new Date('2026-11-03T15:00:40Z'), 'UTC', times, 0)?.time).toBe('15:00');
    expect(openSlot(new Date('2026-11-03T15:01:00Z'), 'UTC', times, 0)).toBeNull();
  });

  it('uses the configured timezone', () => {
    // 12:10 UTC = 15:10 in Moscow
    const slot = openSlot(new Date('2026-11-03T12:10:00Z'), 'Europe/Moscow', times, 30);
    expect(slot?.time).toBe('15:00');
    expect(slot?.startedAt.toISOString()).toBe('2026-11-03T12:00:00.000Z');
  });

  it('finds the next time, wrapping to tomorrow', () => {
    expect(nextSignalTime(new Date('2026-11-03T16:00:00Z'), 'UTC', times)).toBe('18:00');
    expect(nextSignalTime(new Date('2026-11-03T23:00:00Z'), 'UTC', times)).toBe('15:00');
  });

  it('splits the day into clock-aligned "every N minutes" slots', () => {
    const a = everySlot(new Date('2026-11-03T15:14:59Z'), 'UTC', 15);
    const b = everySlot(new Date('2026-11-03T15:15:00Z'), 'UTC', 15);
    expect(a.startedAt.toISOString()).toBe('2026-11-03T15:00:00.000Z');
    expect(b.startedAt.toISOString()).toBe('2026-11-03T15:15:00.000Z');
    expect(a.key).not.toBe(b.key);
    expect(everySlot(new Date('2026-11-03T15:29:00Z'), 'UTC', 15).key).toBe(b.key);
  });

  it('aligns slots to the schedule timezone (Asia/Kolkata is UTC+5:30)', () => {
    // 10:20 UTC = 15:50 in Kolkata → the 15:45 slot, which started at 10:15 UTC
    expect(everySlot(new Date('2026-11-03T10:20:00Z'), 'Asia/Kolkata', 15).startedAt.toISOString()).toBe('2026-11-03T10:15:00.000Z');
  });
});
