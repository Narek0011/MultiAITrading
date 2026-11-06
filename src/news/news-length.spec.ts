import { MAX_TEXT, NewsReply, shortenReply, trimToLength } from './news-formats';
import { newsInstructions } from './news-writer';

const reply = (text: string, bullets: string[] = []): NewsReply => ({ headline: 'Fed holds', text, bullets, pair: 'EUR/USD', levels: [], events: [] });

describe('short news posts', () => {
  it('leaves short texts as they are', () => {
    expect(trimToLength('USD is up 0.4%. Fed holds rates.', 100)).toBe('USD is up 0.4%. Fed holds rates.');
  });

  it('cuts at the last full sentence that fits', () => {
    const text = 'USD rose 0.4% after the Fed held rates. EUR/USD fell to 1.0820. Traders now wait for Friday jobs data and more.';
    expect(trimToLength(text, 70)).toBe('USD rose 0.4% after the Fed held rates. EUR/USD fell to 1.0820.');
  });

  it('cuts at a word with "…" when there is no sentence end to cut at', () => {
    const out = trimToLength('Gold keeps climbing as the dollar slips against every major currency today', 40);
    expect(out).toBe('Gold keeps climbing as the dollar slips…');
    expect(out.length).toBeLessThanOrEqual(40);
  });

  it('caps every layout and keeps at most 3 short bullets', () => {
    const long = 'The dollar moved a lot today. '.repeat(40);
    const r = shortenReply('bullets', reply(long, ['📈 one', '📉 two', '💶 three', '💷 four', `🏦 ${'x'.repeat(200)}`]));
    expect(r.text.length).toBeLessThanOrEqual(MAX_TEXT.bullets);
    expect(r.bullets).toEqual(['📈 one', '📉 two', '💶 three']);
    for (const f of Object.keys(MAX_TEXT) as (keyof typeof MAX_TEXT)[]) expect(shortenReply(f, reply(long)).text.length).toBeLessThanOrEqual(MAX_TEXT[f]);
  });

  it('asks the AI for short factual news, not a personal take', () => {
    const prompt = newsInstructions({ instructions: '', styleExamples: '' } as any, 'en', 'story', true);
    expect(prompt).toContain('short, simple, factual');
    expect(prompt).toContain('150–350 characters');
    expect(prompt).not.toContain('personal take');
  });
});
