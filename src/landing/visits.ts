/** Small, testable pieces of visit tracking (no database). */

export type VisitPeriod = 'today' | '7d' | '30d' | '90d';
export const VISIT_PERIODS: VisitPeriod[] = ['today', '7d', '30d', '90d'];
export const KEEP_DAYS = 90;

interface ReqLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

const header = (req: ReqLike, name: string) => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/** The visitor's IP: Cloudflare's header when the site is behind it, else the (proxy-aware) request IP. */
export function clientIp(req: ReqLike): string {
  const cf = header(req, 'cf-connecting-ip').trim();
  return (cf || req.ip || '').replace(/^::ffff:/, '');
}

/**
 * Search engines, link previews (TelegramBot, WhatsApp, Facebook…), scripts and monitors are not people.
 * "Telegram-Android" (Telegram's in-app browser) is a real visitor, so only "TelegramBot" is matched (via "bot").
 */
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|go-http|headless|lighthouse|monitor|uptime/i;
export const isBot = (ua: string) => !ua.trim() || BOT_UA.test(ua);

export const deviceOf = (ua: string): 'mobile' | 'desktop' => (/mobi|android|iphone|ipad|ipod/i.test(ua) ? 'mobile' : 'desktop');

/** "https://www.tiktok.com/@x" → "tiktok.com"; links from our own site count as direct (null). */
export function referrerHost(referrer: string, ownHost: string): string | null {
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  const bare = (h: string) => h.replace(/^(www|m|l|lm)\./, '');
  host = bare(host);
  return !host || host === bare(ownHost.toLowerCase().split(':')[0]) ? null : host;
}

/** Start of the period in UTC (today = since midnight UTC). */
export function visitPeriodStart(period: VisitPeriod, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ({ today: 0, '7d': 6, '30d': 29, '90d': KEEP_DAYS - 1 }[period] ?? 6));
  return d;
}

/** Where visitors come from, in the order shown in admin; `link: true` ones get a ready-made link to copy. */
export const SOURCES: { id: string; label: string; icon: string; link?: boolean }[] = [
  { id: 'tiktok', label: 'TikTok', icon: '🎵', link: true },
  { id: 'instagram', label: 'Instagram', icon: '📸', link: true },
  { id: 'facebook', label: 'Facebook', icon: '📘', link: true },
  { id: 'youtube', label: 'YouTube', icon: '▶️', link: true },
  { id: 'telegram', label: 'Telegram', icon: '✈️', link: true },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', link: true },
  { id: 'x', label: 'X (Twitter)', icon: '𝕏', link: true },
  { id: 'snapchat', label: 'Snapchat', icon: '👻' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'reddit', label: 'Reddit', icon: '👽' },
  { id: 'google', label: 'Google', icon: '🔎' },
  { id: 'search', label: 'Other search', icon: '🔍' },
  { id: 'direct', label: 'Direct / pasted link', icon: '🔗' },
  { id: 'other', label: 'Other site', icon: '🌐' },
];

/** In-app browsers name themselves in the user-agent (they often send no referrer). */
const APP_UA: [RegExp, string][] = [
  [/Instagram/i, 'instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'facebook'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'tiktok'],
  [/Telegram/i, 'telegram'],
  [/Snapchat/i, 'snapchat'],
  [/LinkedInApp/i, 'linkedin'],
  [/Twitter/i, 'x'],
];

const REFERRER_SOURCE: [RegExp, string][] = [
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, 'telegram'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
  [/(^|\.)snapchat\.com$/, 'snapchat'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)(bing\.com|yandex\.[a-z.]+|duckduckgo\.com|yahoo\.com|baidu\.com|naver\.com)$/, 'search'],
];

/** Source of a page opened from another page of our site. */
export const SELF = 'self';

/** Referrer spam: bots that fake a "came from" site to get it noticed. */
export const isSpamReferrer = (host: string | null) => !!host && /seo|backlink|link-?building|traffic|buttons-for|free-share|best-price/i.test(host);

/** A link tag (?src=insta-bio) as a safe source id: lowercase letters, digits, - and _, at most 24 characters. */
export const cleanSource = (value: unknown) => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) : '');

/** Source id for a referrer host (null host = no referrer). */
export function sourceOfReferrer(host: string | null): string {
  if (!host) return 'direct';
  return REFERRER_SOURCE.find(([re]) => re.test(host))?.[1] ?? 'other';
}

/**
 * Where a visit came from: our link tag first (?src= / utm_source=), then the app's in-app browser,
 * then the referrer site, else direct. Views coming from our own pages are 'self' (not a new arrival).
 */
export function visitSource(v: { src?: unknown; utm?: unknown; ua: string; referrer: string; ownHost: string }): string {
  const tag = cleanSource(v.src) || cleanSource(v.utm);
  if (tag) return tag;
  const host = referrerHost(v.referrer, v.ownHost);
  if (v.referrer && !host && isOwnReferrer(v.referrer, v.ownHost)) return SELF;
  const app = APP_UA.find(([re]) => re.test(v.ua))?.[1];
  if (app) return app;
  return sourceOfReferrer(host);
}

function isOwnReferrer(referrer: string, ownHost: string) {
  try {
    const bare = (h: string) => h.toLowerCase().replace(/^(www|m|l|lm)\./, '');
    return bare(new URL(referrer).hostname) === bare(ownHost.split(':')[0]);
  } catch {
    return false;
  }
}
