import { NewsLang, NewsSettings } from '../settings/settings.types';
import { DEFAULT_PAIRS } from '../pairs/pairs.service';
import { FORMAT_BRIEF, Mover, NewsReply } from './news-formats';
import { NewsFormat, NewsType } from './news-schedule';

const LANGUAGE_NAME: Record<NewsLang, string> = { en: 'English', ru: 'Russian', es: 'Spanish', hy: 'Eastern Armenian (as used in Armenia)' };

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

/**
 * How a real person writes in a Telegram channel. Models drift into recognisable "AI" patterns (em-dashes, "Here's",
 * tidy lists of three, a neat summary at the end); these rules and the owner's own example posts keep the voice human.
 */
export const HUMAN_STYLE = [
  'Write like a real person typing on a phone between trades, not like an editor, a news agency or an AI:',
  '- Mix very short sentences with longer ones. A fragment is fine. Not every sentence needs to be perfect.',
  '- Plain, everyday words a trader would say out loud. In English use contractions (it\'s, don\'t, I\'m).',
  '- Never use the long dash "—". Use a comma, a full stop or a simple "-" instead.',
  '- Never use filler phrases such as: "Here\'s", "Let\'s dive in", "Let\'s break it down", "It\'s worth noting", "In conclusion", "Buckle up", "game-changer", "landscape", "navigate", "delve", "crucial", "in today\'s market", or their equivalents in other languages (e.g. «Давайте разберёмся», «Стоит отметить», «Итак», «В заключение», «Vamos a ver», «Cabe destacar»).',
  '- No lists of exactly three adjectives, no rhetorical question + answer pairs, no neat summary sentence at the end, no motivational sign-off.',
  '- One emoji at most, and sometimes none.',
  '- Give a personal take: what you are watching, what surprised you, what you would be careful about.',
].join('\n');

export function newsInstructions(cfg: NewsSettings, lang: NewsLang, format: NewsFormat, useWebSearch: boolean) {
  const examples = (cfg.styleExamples ?? '').trim();
  return [
    `You run a Telegram channel with forex and trading news. You are an experienced trader talking to the channel's followers.`,
    useWebSearch
      ? 'Use web search to find TODAY\'s real, current market news. Only report facts you found; never invent numbers, quotes or events.'
      : 'Use only the news material provided below. Never invent numbers, quotes or events.',
    `Write everything in ${LANGUAGE_NAME[lang]}.`,
    HUMAN_STYLE,
    'Also:',
    '- Easy to read on a phone. Open differently every time: a number, a short opinion, a "heads up", what just happened. Never a greeting or a title like "Morning brief".',
    '- Mention concrete things: currencies, pairs, levels, data releases, central banks.',
    '- No hashtags, no links, no URLs, no source names or citations in brackets, no markdown or HTML, no buy/sell advice and no profit promises.',
    '- Do not repeat the openings, phrasing or structure of the recent posts listed below.',
    examples ? `Real posts from this channel. Match their voice, length of sentences and tone (do NOT copy their content):\n${examples.slice(0, 3000)}` : '',
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

export function translateInstructions(lang: NewsLang) {
  return [
    `Rewrite the string values of this Telegram post (JSON) in ${LANGUAGE_NAME[lang]}, the way a native trader in that language would write it himself. It must not read like a translation.`,
    'Keep the meaning, tone, emoji and line breaks. Keep pair names, numbers, prices, times and currency codes exactly as they are.',
    HUMAN_STYLE,
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
    // Long dashes between words read as AI; numeric ranges like 1.0900–1.0950 have no spaces and stay.
    .replace(/\s+[—–]\s+/g, ' - ')
    .replace(/(\p{L})—(\p{L})/gu, '$1 - $2')
    // Stock AI openers at the very start.
    .replace(/^\s*(here'?s (the thing|what|why|the deal)[^:\n]*:|let'?s (break it down|dive in|take a look)[^:.!\n]*[:.!]|давайте разбер[её]мся[:.!]?)\s*(\p{L})/iu, (_m, _o, _a, _b, first: string) => first.toUpperCase())
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
