import { formatPrice } from '../common/forex';
import { Lang } from '../settings/settings.types';
import { NewsFormat, NewsType } from './news-schedule';

/** What the AI returns for every format; fields a format doesn't use come back empty. */
export interface NewsReply {
  headline: string;
  text: string;
  bullets: string[];
  pair: string;
  levels: { label: string; price: number }[];
  events: { time: string; currency: string; title: string; expected: string }[];
}

/** Real 24h change of a pair, from market data (never from the AI). */
export interface Mover {
  pair: string;
  change: number;
}

/** Layout rules added to the prompt for each format. */
export const FORMAT_BRIEF: Record<NewsFormat, string> = {
  story:
    'Layout STORY: "text" is one flowing post of 450–850 characters in short paragraphs (1–3 sentences each). "headline", "bullets", "levels" and "events" stay empty.',
  bullets:
    'Layout BULLETS: "headline" is a punchy title of at most 60 characters (no emoji, no final period). "bullets" has 3–5 key points, each one sentence under 110 characters that starts with one fitting emoji. "text" is one closing line under 160 characters about what you are watching next. "levels" and "events" stay empty.',
  levels:
    'Layout LEVELS: focus on ONE pair ("pair"). "headline" is a short title under 50 characters about that pair (without the pair name). "text" is 250–500 characters: what is driving it and what would change the picture. "levels" has 2–4 real support/resistance prices close to the current price, each labelled with the word for "Resistance" or "Support" in the post language. "bullets" and "events" stay empty.',
  calendar:
    'Layout CALENDAR: "events" lists 3–7 of the most important scheduled releases and central bank events for the day, in time order: "time" is HH:MM in the timezone of the current time given, "currency" the 3-letter code, "title" a short name under 40 characters, "expected" the forecast if known (e.g. "3.1%") or "". "headline" is a short title under 40 characters. "text" is one or two sentences under 220 characters on which event matters most and why. "bullets" and "levels" stay empty.',
  movers:
    'Layout MOVERS: the real 24h moves are listed below under "Market movers" — never change those numbers. "headline" is a short title under 50 characters about the main move. "text" is 300–600 characters on what drove the biggest movers. "bullets", "levels" and "events" stay empty.',
  quick:
    'Layout QUICK TAKE: "text" is 1–3 sentences, 120–300 characters — one sharp observation about the market right now. "headline", "bullets", "levels" and "events" stay empty.',
};

/** Formats that fit each time of day; the auto pick rotates through them. */
export const FORMAT_POOL: Record<NewsType, NewsFormat[]> = {
  morning: ['calendar', 'bullets', 'levels', 'story'],
  midday: ['story', 'movers', 'quick', 'levels'],
  evening: ['movers', 'bullets', 'story'],
};

/** A format for this time of day that differs from the last two posts. */
export function pickFormat(type: NewsType, recent: string[], rnd: () => number = Math.random): NewsFormat {
  const pool = FORMAT_POOL[type];
  const avoid = new Set(recent.slice(0, 2));
  const fresh = pool.filter((f) => !avoid.has(f));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rnd() * from.length) % from.length];
}

/** Falls back to a simpler format when the AI or the market data didn't give what a format needs. */
export function settleFormat(format: NewsFormat, r: NewsReply, movers: Mover[]): NewsFormat {
  if (format === 'calendar' && !r.events.length) return r.bullets.length ? 'bullets' : 'story';
  if (format === 'movers' && movers.length < 3) return 'story';
  if (format === 'bullets' && !r.bullets.length) return 'story';
  return format;
}

/** Words that appear on images and around the post, per language. */
export const NEWS_LABELS: Record<Lang, { kicker: Record<NewsType, string>; calendar: string; movers: string; moversSub: string; expected: string; resistance: string; support: string }> = {
  en: { kicker: { morning: 'Morning brief', midday: 'Midday update', evening: 'Evening recap' }, calendar: 'Economic calendar', movers: 'Top movers', moversSub: 'last 24 hours', expected: 'exp.', resistance: 'Resistance', support: 'Support' },
  ru: { kicker: { morning: 'Утренний обзор', midday: 'Дневной апдейт', evening: 'Итоги дня' }, calendar: 'Экономический календарь', movers: 'Лидеры движения', moversSub: 'за 24 часа', expected: 'прогноз', resistance: 'Сопротивление', support: 'Поддержка' },
  es: { kicker: { morning: 'Resumen matinal', midday: 'Actualización', evening: 'Cierre del día' }, calendar: 'Calendario económico', movers: 'Mayores movimientos', moversSub: 'últimas 24 horas', expected: 'prev.', resistance: 'Resistencia', support: 'Soporte' },
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STARTS_WITH_EMOJI = /^\p{Extended_Pictographic}/u;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

/** Builds the Telegram HTML for a post. The AI writes plain text; only this adds markup. */
export function formatPost(format: NewsFormat, r: NewsReply, lang: Lang, movers: Mover[] = []): string {
  const e = escapeHtml;
  const head = (icon: string, title: string) => (title ? `<b>${icon ? icon + ' ' : ''}${e(title)}</b>` : '');
  const parts: string[] = [];
  switch (format) {
    case 'bullets':
      parts.push(head('', r.headline), r.bullets.map((b) => e(STARTS_WITH_EMOJI.test(b) ? b : `• ${b}`)).join('\n'), e(r.text));
      break;
    case 'levels': {
      const levels = [...r.levels].sort((a, b) => b.price - a.price);
      parts.push(head('📍', r.headline ? `${r.pair} — ${r.headline}` : r.pair), e(r.text));
      if (levels.length) parts.push(levels.map((l) => `▫️ ${e(l.label)}: <b>${formatPrice(r.pair, l.price)}</b>`).join('\n'));
      break;
    }
    case 'calendar':
      parts.push(
        head('🗓', r.headline),
        r.events
          .map((ev) => `🕐 <b>${e(ev.time)}</b> · ${e(ev.currency)} — ${e(ev.title)}${ev.expected ? ` (${NEWS_LABELS[lang].expected} ${e(ev.expected)})` : ''}`)
          .join('\n'),
        e(r.text),
      );
      break;
    case 'movers':
      parts.push(
        head('📊', r.headline),
        [...movers].sort((a, b) => b.change - a.change).map((m) => `${m.change >= 0 ? '🟢' : '🔴'} ${e(m.pair)}  <b>${signed(m.change)}</b>`).join('\n'),
        e(r.text),
      );
      break;
    case 'quick':
      parts.push(`⚡️ ${e(r.text)}`);
      break;
    default:
      parts.push(head('', r.headline), e(r.text));
  }
  return parts.filter(Boolean).join('\n\n');
}
