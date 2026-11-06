import { EMOJI_SLOTS, EmojiSlot } from './messages';

/** Normal emoji → Telegram custom emoji id. */
export type EmojiMap = Map<string, string>;

const VS16 = /️/g;

/**
 * Builds the map from the admin's lines ("✅ 5373001317042101552", one per line) and the
 * expiry-post icon fields (emojiUp → 📈 …), so an id entered anywhere is used in every post.
 */
export function emojiMap(tg: Partial<Record<EmojiSlot, string>> & { emojiMap?: string }): EmojiMap {
  const map: EmojiMap = new Map();
  for (const [slot, emoji] of Object.entries(EMOJI_SLOTS)) {
    const id = (tg[slot as EmojiSlot] ?? '').trim();
    if (/^\d+$/.test(id)) map.set(emoji.replace(VS16, ''), id);
  }
  for (const line of (tg.emojiMap ?? '').split('\n')) {
    const m = /^\s*(\S+)\s+(\d{5,})\s*$/.exec(line);
    if (m) map.set(m[1].replace(VS16, ''), m[2]);
  }
  return map;
}

/**
 * Wraps every mapped emoji in `<tg-emoji>`. Only text is touched: HTML tags and emoji
 * that are already custom stay as they are. Matching ignores the U+FE0F variation selector.
 */
export function applyPremiumEmoji(html: string, map: EmojiMap): string {
  if (!map.size) return html;
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => [...k].map((ch) => escapeRe(ch) + '\\uFE0F?').join(''));
  const re = new RegExp(`(${keys.join('|')})`, 'gu');
  return html
    .split(/(<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>|<[^>]+>)/)
    .map((part, i) => (i % 2 ? part : part.replace(re, (e) => `<tg-emoji emoji-id="${map.get(e.replace(VS16, ''))}">${e}</tg-emoji>`)))
    .join('');
}

/** The bot can't send custom emoji (without a Fragment username): keep just the normal emoji. */
export const stripPremiumEmoji = (html: string) => html.replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, '$1');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
