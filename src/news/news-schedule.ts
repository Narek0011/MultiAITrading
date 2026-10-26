export type NewsType = 'morning' | 'midday' | 'evening';
export const NEWS_TYPES: NewsType[] = ['morning', 'midday', 'evening'];

/** How a post looks: the text layout and the image that goes with it (see news-formats.ts). */
export type NewsFormat = 'story' | 'bullets' | 'levels' | 'calendar' | 'movers' | 'quick';
export const NEWS_FORMATS: NewsFormat[] = ['story', 'bullets', 'levels', 'calendar', 'movers', 'quick'];
/** A fixed format, or 'auto' = rotate so posts don't look the same. */
export type NewsFormatChoice = NewsFormat | 'auto';

export interface NewsSlot {
  time: string; // HH:MM in the configured timezone
  type: NewsType;
  format: NewsFormatChoice;
  /** Channel keys; empty = every enabled channel. */
  channels: string[];
}

/** A slot is only posted within this window after its time (so a restart at night doesn't post the morning brief). */
export const LATE_LIMIT_MIN = 90;

export const newsFormatChoice = (f?: string): NewsFormatChoice => (NEWS_FORMATS.includes(f as NewsFormat) ? (f as NewsFormat) : 'auto');

/** "08:00|morning|bullets|main,en" → slot (format and channels optional); invalid entries are dropped; sorted by time. */
export function parseSlots(raw: string[]): NewsSlot[] {
  return raw
    .map((entry): NewsSlot | null => {
      const [time, type, format, channels] = entry.split('|').map((s) => s.trim());
      const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || !NEWS_TYPES.includes(type as NewsType)) return null;
      return {
        time: `${m[1].padStart(2, '0')}:${m[2]}`,
        type: type as NewsType,
        format: newsFormatChoice(format),
        channels: (channels ?? '').split(',').map((c) => c.trim()).filter(Boolean),
      };
    })
    .filter((s): s is NewsSlot => s !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Calendar day, minutes since midnight and weekday of `date` in `timeZone` (falls back to UTC). */
export function zonedParts(date: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  } catch {
    return zonedParts(date, 'UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekend: get('weekday') === 'Sat' || get('weekday') === 'Sun',
  };
}

export const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Slots whose time has come today (within LATE_LIMIT_MIN) and that were not posted yet. */
export function dueSlots(now: Date, timeZone: string, slots: NewsSlot[], postedToday: Set<string>) {
  const { minutes } = zonedParts(now, timeZone);
  return slots.filter((s) => {
    const diff = minutes - minutesOf(s.time);
    return diff >= 0 && diff <= LATE_LIMIT_MIN && !postedToday.has(s.time);
  });
}

/** The next slot time today that hasn't passed, or the first one tomorrow. */
export function nextSlot(now: Date, timeZone: string, slots: NewsSlot[]) {
  const { minutes } = zonedParts(now, timeZone);
  return slots.find((s) => minutesOf(s.time) > minutes) ?? slots[0] ?? null;
}
