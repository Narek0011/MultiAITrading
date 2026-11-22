import { applyPremiumEmoji, BUILT_IN_EMOJI, emojiMap, premiumEmojiList, stripPremiumEmoji } from './premium-emoji';

describe('premium emoji', () => {
  const map = emojiMap({ emojiUp: '111111', emojiMap: '✅ 222222\n⚖️ 333333\nnot a line\n❌ abc' });

  it('reads the icon fields and the admin lines, on top of the built-in ids', () => {
    expect(map.get('📈')).toBe('111111');
    expect(map.get('✅')).toBe('222222'); // the admin's id wins over the built-in one
    expect(map.get('⚖')).toBe('333333');
    expect(map.get('❌')).toBe(BUILT_IN_EMOJI['❌']); // "❌ abc" is not a valid line
    expect(map.get('🔥')).toBe(BUILT_IN_EMOJI['🔥']);
  });

  it('lists every emoji that has a Premium id, for the news prompt', () => {
    expect(premiumEmojiList({})).toEqual(Object.keys(BUILT_IN_EMOJI));
    expect(premiumEmojiList({ emojiUp: '1' })).toContain('📈');
  });

  it('wraps mapped emoji in text only, leaving tags, existing custom emoji and unmapped emoji alone', () => {
    const html = '✅ <b>WIN</b> 📈 <tg-emoji emoji-id="9">✅</tg-emoji> <a href="x✅">go</a> 🙂';
    expect(applyPremiumEmoji(html, map)).toBe(
      '<tg-emoji emoji-id="222222">✅</tg-emoji> <b>WIN</b> <tg-emoji emoji-id="111111">📈</tg-emoji> <tg-emoji emoji-id="9">✅</tg-emoji> <a href="x✅">go</a> 🙂',
    );
  });

  it('matches with or without the U+FE0F variation selector', () => {
    expect(applyPremiumEmoji('⚖️ and ⚖', map)).toBe('<tg-emoji emoji-id="333333">⚖️</tg-emoji> and <tg-emoji emoji-id="333333">⚖</tg-emoji>');
  });

  it('strips custom emoji back to normal ones for the bot', () => {
    expect(stripPremiumEmoji('<tg-emoji emoji-id="1">✅</tg-emoji> ok')).toBe('✅ ok');
  });
});
