import { Lang, NewsSettings } from '../settings/settings.types';
import { DEFAULT_PAIRS } from '../pairs/pairs.service';
import { NewsType } from './news-schedule';

const LANGUAGE_NAME: Record<Lang, string> = { en: 'English', ru: 'Russian', es: 'Spanish' };

const BRIEF: Record<NewsType, string> = {
  morning:
    'MORNING BRIEF before the London open: what matters for forex traders today — scheduled economic releases (with times and expectations), central bank speakers, and the one or two pairs worth watching today and why.',
  midday:
    'MIDDAY UPDATE: the biggest forex move or market story so far today, what drove it, and what traders are watching next.',
  evening:
    'EVENING RECAP: how the forex day went — the main movers and the news behind them, and what is on the calendar for tomorrow.',
};

export const NEWS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'pair'],
  properties: {
    text: { type: 'string', description: 'The finished Telegram post.' },
    pair: { type: 'string', enum: DEFAULT_PAIRS, description: 'The pair the post is most about, for the chart.' },
  },
} as const;

export function newsInstructions(cfg: NewsSettings, useWebSearch: boolean) {
  return [
    `You run a Telegram channel with forex and trading news. You write like a real, experienced trader talking to the channel's followers — not like a news agency and never like an AI.`,
    useWebSearch
      ? 'Use web search to find TODAY\'s real, current market news. Only report facts you found; never invent numbers, quotes or events.'
      : 'Use only the news material provided below. Never invent numbers, quotes or events.',
    'Style rules:',
    '- Write the whole post in ' + LANGUAGE_NAME[cfg.language] + '.',
    '- 450–850 characters. Short paragraphs (1–3 sentences), easy to read on a phone.',
    '- Open differently every time: a question, a striking number, a short opinion, a "heads up"… never a generic greeting or a title like "Morning brief".',
    '- First person and natural ("I\'m watching…", "worth keeping an eye on…"). One or two fitting emoji at most.',
    '- Mention concrete things: currencies, pairs, levels, data releases, central banks.',
    '- No hashtags, no links, no markdown or HTML, no "as an AI", no buy/sell advice and no profit promises.',
    '- Do not repeat the openings, phrasing or structure of the recent posts listed below.',
    cfg.instructions ? `Extra instructions from the channel owner: ${cfg.instructions}` : '',
    'Return JSON with "text" (the post) and "pair" (the pair it is most about).',
  ]
    .filter(Boolean)
    .join('\n');
}

export function newsInput(type: NewsType, nowText: string, recent: string[], sourcesText: string) {
  return [
    `Task: ${BRIEF[type]}`,
    `Current time: ${nowText}`,
    recent.length ? `Recent posts (do not repeat their style):\n${recent.map((t, i) => `${i + 1}. ${t.slice(0, 300)}`).join('\n')}` : '',
    sourcesText ? `News material from the channel's sources:\n${sourcesText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pulls the JSON object out of a model reply (some tool-using replies wrap it in prose). */
export function parseNewsReply(raw: string): { text: string; pair: string } {
  const json = raw.trim().startsWith('{') ? raw : (/\{[\s\S]*\}/.exec(raw)?.[0] ?? '');
  const data = JSON.parse(json);
  const text = String(data.text ?? '').trim();
  if (!text) throw new Error('The AI returned an empty post');
  const pair = DEFAULT_PAIRS.includes(data.pair) ? data.pair : 'EUR/USD';
  return { text, pair };
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
