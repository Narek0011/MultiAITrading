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
