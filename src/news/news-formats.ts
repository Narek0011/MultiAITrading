import { formatPrice } from '../common/forex';
import { NewsLang } from '../settings/settings.types';
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
    'Layout STORY: "headline" is a short title under 50 characters (no emoji, no final period). "text" is 2–3 short sentences, 150–350 characters in total: the main fact, the number, which currency or pair it affects. "bullets", "levels" and "events" stay empty.',
  bullets:
    'Layout BULLETS: "headline" is a short title under 50 characters (no emoji, no final period). "bullets" has exactly 3 key facts, each under 90 characters and starting with one fitting emoji. "text" is "" or one line under 100 characters. "levels" and "events" stay empty.',
  levels:
    'Layout LEVELS: focus on ONE pair ("pair"). "headline" is a short title under 40 characters about that pair (without the pair name). "text" is 100–220 characters: why the pair is moving. "levels" has 2–3 real support/resistance prices close to the current price, each labelled with the word for "Resistance" or "Support" in the post language. "bullets" and "events" stay empty.',
  calendar:
    'Layout CALENDAR: "events" lists the 3–5 most important scheduled releases and central bank events for the day, in time order: "time" is HH:MM in the timezone of the current time given, "currency" the 3-letter code, "title" a short name under 35 characters, "expected" the forecast if known (e.g. "3.1%") or "". "headline" is a short title under 40 characters. "text" is one sentence under 140 characters on the event that matters most. "bullets" and "levels" stay empty.',
  movers:
    'Layout MOVERS: the real 24h moves are listed below under "Market movers" — never change those numbers. "headline" is a short title under 45 characters about the main move. "text" is 100–220 characters: the biggest move and what caused it. "bullets", "levels" and "events" stay empty.',
  quick:
    'Layout QUICK TAKE: "text" is 1–2 sentences, 80–200 characters: one fact about the market right now. "headline", "bullets", "levels" and "events" stay empty.',
};

/** Hard caps on "text" per layout, so a post stays short even when the AI writes too much. */
export const MAX_TEXT: Record<NewsFormat, number> = { story: 400, bullets: 120, levels: 260, calendar: 160, movers: 260, quick: 220 };
const MAX_BULLETS = 3;
const MAX_BULLET_LEN = 110;

/** Cuts `s` to `max` characters at the last sentence end, else the last word (adding "…"). */
export function trimToLength(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('.\n'), head.lastIndexOf('։ '));
  if (sentence > max * 0.4) return head.slice(0, sentence + 1).trim();
  const space = head.lastIndexOf(' ');
  return `${head.slice(0, space > max * 0.5 ? space : max - 1).replace(/[\s,;:.-]+$/, '')}…`;
}

/** Keeps AI posts short: text capped per layout, at most 3 short bullets. */
export function shortenReply(format: NewsFormat, r: NewsReply): NewsReply {
  return {
    ...r,
    text: trimToLength(r.text.trim(), MAX_TEXT[format]),
    bullets: r.bullets.slice(0, MAX_BULLETS).map((b) => trimToLength(b.trim(), MAX_BULLET_LEN)),
  };
}

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
export const NEWS_LABELS: Record<NewsLang, { kicker: Record<NewsType, string>; calendar: string; movers: string; moversSub: string; expected: string; resistance: string; support: string; news: string }> = {
  en: { kicker: { morning: 'Morning brief', midday: 'Midday update', evening: 'Evening recap' }, calendar: 'Economic calendar', movers: 'Top movers', moversSub: 'last 24 hours', expected: 'exp.', resistance: 'Resistance', support: 'Support', news: 'Market news' },
  ru: { kicker: { morning: 'Утренний обзор', midday: 'Дневной апдейт', evening: 'Итоги дня' }, calendar: 'Экономический календарь', movers: 'Лидеры движения', moversSub: 'за 24 часа', expected: 'прогноз', resistance: 'Сопротивление', support: 'Поддержка', news: 'Новости рынка' },
  es: { kicker: { morning: 'Resumen matinal', midday: 'Actualización', evening: 'Cierre del día' }, calendar: 'Calendario económico', movers: 'Mayores movimientos', moversSub: 'últimas 24 horas', expected: 'prev.', resistance: 'Resistencia', support: 'Soporte', news: 'Noticias del mercado' },
  hy: { kicker: { morning: 'Առավոտյան ակնարկ', midday: 'Օրվա թարմացում', evening: 'Օրվա ամփոփում' }, calendar: 'Տնտեսական օրացույց', movers: 'Ամենամեծ շարժերը', moversSub: 'վերջին 24 ժամում', expected: 'կանխ.', resistance: 'Դիմադրություն', support: 'Աջակցություն', news: 'Շուկայի նորություններ' },
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STARTS_WITH_EMOJI = /^\p{Extended_Pictographic}/u;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

/** Builds the Telegram HTML for a post. The AI writes plain text; only this adds markup. */
export function formatPost(format: NewsFormat, r: NewsReply, lang: NewsLang, movers: Mover[] = []): string {
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
