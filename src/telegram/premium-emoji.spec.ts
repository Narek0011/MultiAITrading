import { applyPremiumEmoji, emojiMap, stripPremiumEmoji } from './premium-emoji';

describe('premium emoji', () => {
  const map = emojiMap({ emojiUp: '111111', emojiMap: '✅ 222222\n⚖️ 333333\nnot a line\n❌ abc' });

  it('reads the icon fields and the admin lines', () => {
    expect([...map.entries()]).toEqual([['📈', '111111'], ['✅', '222222'], ['⚖', '333333']]);
  });

  it('wraps mapped emoji in text only, leaving tags, existing custom emoji and unmapped emoji alone', () => {
    const html = '✅ <b>WIN</b> 📈 <tg-emoji emoji-id="9">✅</tg-emoji> <a href="x✅">go</a> ❌';
    expect(applyPremiumEmoji(html, map)).toBe(
      '<tg-emoji emoji-id="222222">✅</tg-emoji> <b>WIN</b> <tg-emoji emoji-id="111111">📈</tg-emoji> <tg-emoji emoji-id="9">✅</tg-emoji> <a href="x✅">go</a> ❌',
    );
  });

  it('matches with or without the U+FE0F variation selector', () => {
    expect(applyPremiumEmoji('⚖️ and ⚖', map)).toBe('<tg-emoji emoji-id="333333">⚖️</tg-emoji> and <tg-emoji emoji-id="333333">⚖</tg-emoji>');
  });

  it('strips custom emoji back to normal ones for the bot', () => {
    expect(stripPremiumEmoji('<tg-emoji emoji-id="1">✅</tg-emoji> ok')).toBe('✅ ok');
  });
});
