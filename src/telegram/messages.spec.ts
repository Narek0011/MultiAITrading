import { analyzingText, expiryCaption, expiryResultText, signalCaption } from './messages';

const base = {
  pair: 'GBP/JPY', direction: 'BUY' as const, entry: 191.234, stopLoss: 190.9, takeProfit1: 191.6, takeProfit2: 192.0,
  confidence: 81, reasoning: 'Trend & momentum <aligned>.', timeframe: '15min' as const, mode: 'AI' as const,
};

describe('signalCaption', () => {
  it('formats JPY prices with 3 decimals and pips', () => {
    const text = signalCaption(base, 'en', { showReasoning: true, showConfidence: true });
    expect(text).toContain('<code>191.234</code>');
    expect(text).toContain('(−33.4 pips)');
    expect(text).toContain('#GBPJPY');
    expect(text).toContain('Trend &amp; momentum &lt;aligned&gt;.');
  });

  it('stays within the 1024 character photo caption limit', () => {
    const text = signalCaption({ ...base, reasoning: 'x'.repeat(3000) }, 'ru', { showReasoning: true, showConfidence: true });
    expect(text.length).toBeLessThanOrEqual(1024);
  });

  it('respects the hide options', () => {
    const text = signalCaption(base, 'es', { showReasoning: false, showConfidence: false });
    expect(text).not.toContain('Análisis');
    expect(text).not.toContain('81%');
    expect(text).toContain('Entrada');
  });
});

describe('expiryCaption', () => {
  const sig = { pair: 'GBP/CAD', direction: 'BUY' as const, confidence: 79, expiryMinutes: 2 };

  it('matches the English brand layout', () => {
    expect(expiryCaption(sig, 'en', { showConfidence: true })).toBe(
      [
        '📈 <b>BUY GBP/CAD • 2 MIN</b> ⏱',
        '',
        '🤖 <b>AI TRADING SIGNAL</b>',
        '',
        '🧠 Asset: GBP/CAD',
        '🧠 Direction: BUY / UP',
        '🧠 Expiration: 02:00',
        '🧠 Status: ACTIVE',
        '',
        '👨‍🔬 <b>CONFIDENCE — 79%</b>',
        '',
        '<blockquote>📊 <i>MultiAI Trading • AI-Powered Analysis</i></blockquote>',
      ].join('\n'),
    );
  });

  it('writes the Armenian version with bold labels', () => {
    const text = expiryCaption({ ...sig, direction: 'SELL' }, 'hy', { showConfidence: true });
    expect(text).toContain('📉 <b>ՆԵՐՔԵՎ (SELL) GBP/CAD • 2 ՐՈՊԵ</b>');
    expect(text).toContain('<b>Ուղղություն՝</b> ՎԱՃԱՌՔ / ՆԵՐՔԵՎ');
    expect(text).toContain('<b>Գործարքի տևողություն՝</b> 02:00 րոպե');
    expect(text).toContain('AI ՎՍՏԱՀՈՒԹՅԱՆ ՄԱԿԱՐԴԱԿ՝ 79%');
    expect(text).toContain('Արհեստական բանականության վրա հիմնված վերլուծություն');
  });

  it('uses custom emoji only for slots with a numeric id, and can switch them off', () => {
    const emoji = { emojiUp: '5368324170671202286', emojiClock: 'not-an-id' };
    const text = expiryCaption(sig, 'en', { showConfidence: false, emoji });
    expect(text).toContain('<tg-emoji emoji-id="5368324170671202286">📈</tg-emoji> <b>BUY');
    expect(text).toContain('</b> ⏱');
    expect(text).not.toContain('CONFIDENCE');
    expect(expiryCaption(sig, 'en', { showConfidence: true, emoji, useCustomEmoji: false })).not.toContain('tg-emoji');
  });
});

describe('expiry results and analyzing posts', () => {
  const s = { pair: 'GBP/CAD', direction: 'BUY' as const, entry: 1.81234 };

  it('replies WIN / LOSS / DRAW with the entry and close price, in every language', () => {
    expect(expiryResultText('WIN', s, 1.81302, 'en')).toBe('✅ <b>WIN</b> · GBP/CAD 📈\n💰 1.81234 → 1.81302');
    expect(expiryResultText('LOSS', { ...s, direction: 'SELL' }, 1.81302, 'ru')).toBe('❌ <b>МИНУС</b> · GBP/CAD 📉\n📊 1.81234 → 1.81302');
    expect(expiryResultText('EXPIRED', s, 1.81234, 'es')).toContain('<b>EMPATE</b>');
    expect(expiryResultText('WIN', s, 1.81302, 'hy')).toContain('<b>ՇԱՀՈՒՄ</b>');
  });

  it('lists up to five pairs in the analyzing message', () => {
    const text = analyzingText(['A', 'B', 'C', 'D', 'E', 'F'], 'en');
    expect(text).toBe('🤖 <b>AI is analyzing the market…</b>\n🔍 A · B · C · D · E …\n⏳ <i>Signal in a moment</i>');
    expect(analyzingText([], 'hy')).not.toContain('🔍');
  });
});
