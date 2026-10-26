import { Lang, NewsSettings } from '../settings/settings.types';
import { DEFAULT_PAIRS } from '../pairs/pairs.service';
import { FORMAT_BRIEF, Mover, NewsReply } from './news-formats';
import { NewsFormat, NewsType } from './news-schedule';

const LANGUAGE_NAME: Record<Lang, string> = { en: 'English', ru: 'Russian', es: 'Spanish' };

const BRIEF: Record<NewsType, string> = {
  morning:
    'MORNING BRIEF before the London open: what matters for forex traders today — scheduled economic releases (with times and expectations), central bank speakers, and the one or two pairs worth watching today and why.',
  midday:
    'MIDDAY UPDATE: the biggest forex move or market story so far today, what drove it, and what traders are watching next.',
  evening:
    'EVENING RECAP: how the forex day went — the main movers and the news behind them, and what is on the calendar for tomorrow.',
};

const str = (description: string) => ({ type: 'string', description });

export const NEWS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'text', 'bullets', 'pair', 'levels', 'events'],
  properties: {
    headline: str('Short title, or "" if the layout has none.'),
    text: str('The main post text.'),
    bullets: { type: 'array', items: { type: 'string' }, description: 'Key points, or [] if the layout has none.' },
    pair: { type: 'string', enum: DEFAULT_PAIRS, description: 'The pair the post is most about, for the chart.' },
    levels: {
      type: 'array',
      description: 'Support/resistance levels, or [] if the layout has none.',
      items: { type: 'object', additionalProperties: false, required: ['label', 'price'], properties: { label: { type: 'string' }, price: { type: 'number' } } },
    },
    events: {
      type: 'array',
      description: 'Calendar events, or [] if the layout has none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['time', 'currency', 'title', 'expected'],
        properties: { time: { type: 'string' }, currency: { type: 'string' }, title: { type: 'string' }, expected: { type: 'string' } },
      },
    },
  },
} as const;

export function newsInstructions(cfg: NewsSettings, lang: Lang, format: NewsFormat, useWebSearch: boolean) {
  return [
    `You run a Telegram channel with forex and trading news. You write like a real, experienced trader talking to the channel's followers — not like a news agency and never like an AI.`,
    useWebSearch
      ? 'Use web search to find TODAY\'s real, current market news. Only report facts you found; never invent numbers, quotes or events.'
      : 'Use only the news material provided below. Never invent numbers, quotes or events.',
    'Style rules:',
    '- Write everything in ' + LANGUAGE_NAME[lang] + '.',
    '- Easy to read on a phone. Open differently every time: a question, a striking number, a short opinion, a "heads up"… never a generic greeting or a title like "Morning brief".',
    '- First person and natural ("I\'m watching…", "worth keeping an eye on…"). One or two fitting emoji at most in "text".',
    '- Mention concrete things: currencies, pairs, levels, data releases, central banks.',
    '- No hashtags, no links, no URLs, no source names or citations in brackets, no markdown or HTML, no "as an AI", no buy/sell advice and no profit promises.',
    '- Do not repeat the openings, phrasing or structure of the recent posts listed below.',
    FORMAT_BRIEF[format],
    cfg.instructions ? `Extra instructions from the channel owner: ${cfg.instructions}` : '',
    'Return JSON with every field; "pair" is the pair the post is most about.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function newsInput(type: NewsType, nowText: string, recent: string[], sourcesText: string, movers: Mover[] = []) {
  return [
    `Task: ${BRIEF[type]}`,
    `Current time: ${nowText}`,
    movers.length ? `Market movers (real 24h change):\n${movers.map((m) => `${m.pair} ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`).join('\n')}` : '',
    recent.length ? `Recent posts (do not repeat their style):\n${recent.map((t, i) => `${i + 1}. ${t.slice(0, 300)}`).join('\n')}` : '',
    sourcesText ? `News material from the channel's sources:\n${sourcesText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function translateInstructions(lang: Lang) {
  return [
    `Translate the string values of this Telegram post (JSON) into ${LANGUAGE_NAME[lang]}, as a native trader would write it.`,
    'Keep the meaning, tone, emoji and line breaks. Keep pair names, numbers, prices, times and currency codes exactly as they are.',
    'Return the same JSON structure with the same number of bullets, levels and events.',
  ].join('\n');
}

/** Takes the translated words but keeps every number and code from the original. */
export function mergeTranslation(orig: NewsReply, tr: NewsReply): NewsReply {
  return {
    headline: tr.headline || orig.headline,
    text: tr.text || orig.text,
    bullets: tr.bullets.length === orig.bullets.length ? tr.bullets : orig.bullets,
    pair: orig.pair,
    levels: orig.levels.map((l, i) => ({ ...l, label: tr.levels[i]?.label || l.label })),
    events: orig.events.map((ev, i) => ({ ...ev, title: tr.events[i]?.title || ev.title })),
  };
}

/**
 * Removes what web search adds to the text: citations like "([site.com](https://…?utm_source=openai))",
 * markdown links and bare URLs. Keeps the post's own line breaks.
 */
export function cleanNewsText(text: string): string {
  return text
    .replace(/\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, '') // ([site](url))
    .replace(/\[([^\]]*)\]\(https?:[^)]*\)/g, '') // [site](url)
    .replace(/https?:\/\/\S+/g, '') // bare URLs
    .replace(/\(\s*\)/g, '') // empty brackets left behind
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pulls the JSON object out of a model reply (some tool-using replies wrap it in prose) and cleans every text field. */
export function parseNewsReply(raw: string): NewsReply {
  const json = raw.trim().startsWith('{') ? raw : (/\{[\s\S]*\}/.exec(raw)?.[0] ?? '');
  const data = JSON.parse(json);
  const clean = (v: unknown) => cleanNewsText(String(v ?? ''));
  const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const text = clean(data.text);
  if (!text) throw new Error('The AI returned an empty post');
  return {
    headline: clean(data.headline),
    text,
    bullets: list(data.bullets).map(clean).filter(Boolean),
    pair: DEFAULT_PAIRS.includes(data.pair) ? data.pair : 'EUR/USD',
    levels: list(data.levels)
      .map((l) => ({ label: clean(l?.label), price: Number(l?.price) }))
      .filter((l) => l.label && Number.isFinite(l.price) && l.price > 0),
    events: list(data.events)
      .map((ev) => ({ time: clean(ev?.time), currency: clean(ev?.currency).toUpperCase(), title: clean(ev?.title), expected: clean(ev?.expected) }))
      .filter((ev) => ev.time && ev.title),
  };
}

const MAX_WAIT_MS = 30_000;

/** True for OpenAI's temporary per-minute limit (worth waiting for), not for "no credits". */
export const isRateLimit = (err: any) => err?.status === 429 && err?.code !== 'insufficient_quota' && !/quota|credits/i.test(err?.message ?? '');

/** How long to wait before retrying a rate-limited call: the hint in the message/header + 1s, capped at 30s. */
export function retryDelayMs(err: any): number {
  const msg = String(err?.message ?? '');
  const m = /try again in (?:(\d+)m)?(\d+(?:\.\d+)?)(ms|s)/i.exec(msg);
  let ms = 0;
  if (m) ms = (Number(m[1] ?? 0) * 60 + Number(m[2]) / (m[3] === 'ms' ? 1000 : 1)) * 1000;
  else {
    const header = typeof err?.headers?.get === 'function' ? err.headers.get('retry-after') : err?.headers?.['retry-after'];
    if (header && Number.isFinite(Number(header))) ms = Number(header) * 1000;
    else ms = 10_000;
  }
  return Math.min(MAX_WAIT_MS, Math.ceil(ms) + 1000);
}

/** Short, actionable explanation in front of OpenAI's own message. */
export function friendlyOpenAiError(err: any): string {
  const msg = String(err?.message ?? err);
  const billing = 'Adding a payment method at platform.openai.com/account/billing raises the limits.';
  if (err?.status === 401) return `OpenAI rejected the API key — paste a valid key on the News channel page. (${msg})`;
  if (err?.status === 429 && !isRateLimit(err)) return `The OpenAI account has no credits left. ${billing} (${msg})`;
  if (isRateLimit(err)) return `OpenAI's per-minute limit for this account is too low for the post right now. Try the gpt-5-mini model on the News channel page. ${billing} (${msg})`;
  return msg;
}
