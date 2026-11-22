import { EMOJI_SLOTS, EmojiSlot } from './messages';

/** Normal emoji → Telegram custom emoji id. */
export type EmojiMap = Map<string, string>;

const VS16 = /️/g;

/** Premium emoji we always have an id for (used by the results post and every news post); admin ids override them. */
export const BUILT_IN_EMOJI = {
  '🏆': '5188344996356448758',
  '✅': '5913273744356283222',
  '❌': '5454350746407419714',
  '🔥': '5289722755871162900',
  '💰': '5417924076503062111',
} as const;

/**
 * Builds the map from the admin's lines ("✅ 5373001317042101552", one per line) and the
 * expiry-post icon fields (emojiUp → 📈 …), so an id entered anywhere is used in every post.
 */
export function emojiMap(tg: Partial<Record<EmojiSlot, string>> & { emojiMap?: string }): EmojiMap {
  const map: EmojiMap = new Map(Object.entries(BUILT_IN_EMOJI));
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

/** The emoji that have a Premium id, for prompts that should only use those. */
export const premiumEmojiList = (tg: Parameters<typeof emojiMap>[0]) => [...emojiMap(tg).keys()];

/** One emoji as a custom emoji tag (shown as the normal emoji when the bot, not the Premium account, posts). */
export const premiumTag = (emoji: keyof typeof BUILT_IN_EMOJI) => `<tg-emoji emoji-id="${BUILT_IN_EMOJI[emoji]}">${emoji}</tg-emoji>`;

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
