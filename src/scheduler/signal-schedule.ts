import { zonedParts } from '../news/news-schedule';

/** While a time has no signal yet, a new scan is tried at most this often. */
export const RETRY_EVERY_MIN = 10;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "15:00, 18:00 22:00" → ["15:00","18:00","22:00"]; invalid entries are dropped, duplicates removed, sorted. */
export function parseSignalTimes(raw: string): string[] {
  const times = (raw ?? '')
    .split(/[\s,;]+/)
    .map((t): string | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
      return `${m[1].padStart(2, '0')}:${m[2]}`;
    })
    .filter((t): t is string => t !== null);
  return [...new Set(times)].sort();
}

/** Entries that are not a valid HH:MM — shown as an error in the admin. */
export const invalidSignalTimes = (raw: string) =>
  (raw ?? '').split(/[\s,;]+/).filter((t) => t && !parseSignalTimes(t).length);

export interface OpenSlot {
  /** HH:MM as configured. */
  time: string;
  /** Calendar day in the schedule timezone, for keying attempts. */
  day: string;
  /** When the slot started (start of its minute), as a real instant. */
  startedAt: Date;
}

/**
 * The slot that is open right now: its time has come and its window
 * (`windowMinutes`, at least 1, cut short by the next time and by midnight) hasn't passed.
 */
export function openSlot(now: Date, timeZone: string, times: string[], windowMinutes: number): OpenSlot | null {
  const { day, minutes } = zonedParts(now, timeZone);
  for (let i = times.length - 1; i >= 0; i--) {
    const start = minutesOf(times[i]);
    if (start > minutes) continue;
    const next = i + 1 < times.length ? minutesOf(times[i + 1]) : 24 * 60;
    const end = Math.min(start + Math.max(1, windowMinutes), next);
    if (minutes >= end) return null;
    const startedAt = new Date(now.getTime() - (minutes - start) * 60_000);
    startedAt.setSeconds(0, 0);
    return { time: times[i], day, startedAt };
  }
  return null;
}

/** The "every N minutes" slot `now` is in, aligned to the clock in `timeZone` (e.g. :00, :15, :30, :45). */
export function everySlot(now: Date, timeZone: string, everyMinutes: number): { key: string; startedAt: Date } {
  const every = Math.min(24 * 60, Math.max(1, Math.round(everyMinutes)));
  const { day, minutes } = zonedParts(now, timeZone);
  const index = Math.floor(minutes / every);
  const startedAt = new Date(now.getTime() - (minutes - index * every) * 60_000);
  startedAt.setSeconds(0, 0);
  return { key: `${day} #${index}`, startedAt };
}

/** The next configured time after `now` today, or the first one tomorrow. */
export function nextSignalTime(now: Date, timeZone: string, times: string[]): string | null {
  const { minutes } = zonedParts(now, timeZone);
  return times.find((t) => minutesOf(t) > minutes) ?? times[0] ?? null;
}
