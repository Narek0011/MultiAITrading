import { signalCaption } from './messages';

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
