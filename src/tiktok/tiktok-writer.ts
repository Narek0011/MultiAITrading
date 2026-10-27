import type { SocialSlide } from '../charts/social-card-renderer.service';
import { DEFAULT_PAIRS } from '../pairs/pairs.service';
import { Lang } from '../settings/settings.types';

export type TikTokTopic = 'platform' | 'education' | 'market';
export const TIKTOK_TOPICS: TikTokTopic[] = ['platform', 'education', 'market'];
const SLIDE_KINDS: SocialSlide['kind'][] = ['cover', 'points', 'stat', 'chart', 'cta'];

const LANGUAGE_NAME: Record<Lang, string> = { en: 'English', ru: 'Russian', es: 'Spanish' };

/** Photo titles are capped at 90 characters, captions at 2200 (video) / 4000 (photo description). */
export const TITLE_MAX = 90;
export const CAPTION_MAX = 2200;

const TOPIC_BRIEF: Record<TikTokTopic, string> = {
  platform: 'Our platform itself: how the AI finds setups, what a signal contains, how it reaches Telegram, why fewer but better signals.',
  education: 'Forex education for beginners and intermediate traders: risk management, stop losses, trading psychology, sessions, common mistakes, reading a setup.',
  market: "Today's real forex market: the biggest moves, central banks, data releases — found with web search, never invented.",
};

const PLATFORM = `About MultiAI Trading (the brand you promote):
- An AI scans 17 forex pairs every session, 24/5, through five layers: trend, momentum, structure, volatility and risk.
- Only high-confidence setups get through; each signal has entry, two take-profit targets and a stop loss, plus a chart.
- Signals arrive in a Telegram channel. The website explains how to join.`;

const RULES = `Rules (TikTok and financial-ad safe):
- Never promise profit or income, never say "guaranteed", "easy money", "get rich", no win-rate claims.
- No broker names, no binary options, no buy/sell advice for the viewer; signals are examples.
- Mention once, naturally, that trading involves risk.
- Soft call to action only: "link in bio", "follow for more", "free signals on Telegram".
- No links or URLs in the text, no markdown.`;

const str = { type: 'string' } as const;

export const IDEAS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['title', 'angle'], properties: { title: str, angle: str } },
    },
  },
} as const;

const SLIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'kicker', 'headline', 'text', 'bullets', 'stat', 'pair'],
  properties: {
    kind: { type: 'string', enum: SLIDE_KINDS },
    kicker: str,
    headline: str,
    text: str,
    bullets: { type: 'array', items: str },
    stat: str,
    pair: { type: 'string', enum: ['', ...DEFAULT_PAIRS] },
  },
} as const;

export const POST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'caption', 'hashtags', 'slides'],
  properties: {
    title: str,
    caption: str,
    hashtags: { type: 'array', items: str },
    slides: { type: 'array', items: SLIDE_SCHEMA },
  },
} as const;

export const ONE_SLIDE_SCHEMA = { type: 'object', additionalProperties: false, required: ['slide'], properties: { slide: SLIDE_SCHEMA } } as const;

const voice = (lang: Lang) =>
  `You create TikTok content for MultiAI Trading, an AI forex-signals service, to bring new followers to its Telegram channel. Write everything in ${LANGUAGE_NAME[lang]}, in a lively, confident creator voice for a young trading audience.`;

export function ideasPrompt(topic: TikTokTopic, lang: Lang, recent: string[]) {
  return {
    instructions: [
      voice(lang),
      PLATFORM,
      RULES,
      `Suggest 6 different TikTok post ideas. Topic: ${TOPIC_BRIEF[topic]}`,
      'Each idea: "title" is a scroll-stopping hook (max 70 characters), "angle" is one sentence on what the post shows.',
      'Mix formats: lists, myths vs facts, mistakes, a number that surprises, behind the scenes of the AI.',
    ].join('\n\n'),
    input: recent.length ? `Recent posts — do not repeat them:\n${recent.map((t) => `- ${t}`).join('\n')}` : 'No posts yet.',
  };
}

export function postPrompt(idea: string, lang: Lang, contentType: 'video' | 'photo', recent: string[]) {
  const slides =
    contentType === 'photo'
      ? [
          'Also design a carousel of 4–7 vertical slides that tells the idea:',
          '- First slide "cover": a short "kicker" (2–3 words, e.g. "FOREX · AI"), a hook "headline" (max 60 characters) and a short "text" teaser ending with "→".',
          '- Middle slides: "points" (headline max 50 chars + 3–4 bullets, each max 70 chars), "stat" (a striking but TRUE number in "stat" like "17" or "24/5", headline + text), or "chart" (headline + text about one pair, set "pair").',
          '- Last slide "cta": headline like "Free AI forex signals" and a short text about the Telegram channel.',
          '- Fields a slide kind does not use stay "" or [].',
        ].join('\n')
      : '"slides" stays [] (the video is uploaded separately; write the caption for it).';
  return {
    instructions: [
      voice(lang),
      PLATFORM,
      RULES,
      `Write a TikTok ${contentType === 'video' ? 'video caption' : 'photo carousel post'} for this idea.`,
      `"title": a hook of max ${TITLE_MAX} characters. "caption": 2–5 short lines (max 600 characters) with 1–3 fitting emoji, ending with a soft call to action. "hashtags": 4–7 relevant hashtags without "#" (mix broad like forex, trading with niche ones).`,
      slides,
    ].join('\n\n'),
    input: [`Idea: ${idea}`, recent.length ? `Recent posts — do not repeat them:\n${recent.map((t) => `- ${t}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
  };
}

export function slidePrompt(post: { title: string; slides: SocialSlide[] }, index: number, lang: Lang) {
  return {
    instructions: [voice(lang), PLATFORM, RULES, 'Rewrite ONE slide of a TikTok carousel so it is fresher and punchier. Keep the same "kind" and the same role in the story. Same length limits.'].join('\n\n'),
    input: `Post: ${post.title}\nAll slides: ${JSON.stringify(post.slides)}\nRewrite slide number ${index + 1}.`,
  };
}

const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/\[([^\]]*)\]\(https?:[^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .trim();

export function parseIdeas(data: any): { title: string; angle: string }[] {
  return (Array.isArray(data?.ideas) ? data.ideas : [])
    .map((i: any) => ({ title: clean(i?.title), angle: clean(i?.angle) }))
    .filter((i: { title: string }) => i.title)
    .slice(0, 8);
}

export function parseSlide(s: any): SocialSlide {
  const kind = SLIDE_KINDS.includes(s?.kind) ? s.kind : 'points';
  return {
    kind,
    kicker: clean(s?.kicker).slice(0, 30),
    headline: clean(s?.headline),
    text: clean(s?.text),
    bullets: (Array.isArray(s?.bullets) ? s.bullets : []).map(clean).filter(Boolean).slice(0, 5),
    stat: clean(s?.stat).slice(0, 8),
    pair: DEFAULT_PAIRS.includes(s?.pair) ? s.pair : kind === 'chart' ? 'EUR/USD' : '',
  };
}

/** Caption text as posted: the AI caption, a blank line, then the hashtags. */
export function joinCaption(caption: string, hashtags: string[]) {
  const tags = hashtags
    .map((h) => h.replace(/[#\s]/g, ''))
    .filter(Boolean)
    .map((h) => `#${h}`);
  return [caption.trim(), tags.join(' ')].filter(Boolean).join('\n\n').slice(0, CAPTION_MAX);
}

export function parsePost(data: any, contentType: 'video' | 'photo') {
  const caption = clean(data?.caption);
  if (!caption) throw new Error('The AI returned an empty caption — try again');
  return {
    title: clean(data?.title).slice(0, TITLE_MAX),
    caption: joinCaption(caption, Array.isArray(data?.hashtags) ? data.hashtags.map(String) : []),
    slides: contentType === 'photo' ? (Array.isArray(data?.slides) ? data.slides : []).map(parseSlide).slice(0, 10) : [],
  };
}
