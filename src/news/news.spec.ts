import { dueSlots, nextSlot, parseSlots, zonedParts } from './news-schedule';
import { parseFeed, parseSourceUrls, toPlainText } from './news-sources';
import { newsChannels, websiteNewsUrl } from './news-channels';
import { formatPost, NewsReply, pickFormat, settleFormat } from './news-formats';
import { shortLevelLabels } from './news.service';
import { cleanNewsText, friendlyOpenAiError, isRateLimit, mergeTranslation, parseNewsReply, retryDelayMs } from './news-writer';

describe('news schedule', () => {
  const slots = parseSlots(['19:00|evening', '8:00|morning', '13:30|midday', 'bad', '25:00|morning', '10:00|lunch']);

  it('parses, validates and sorts slots', () => {
    expect(slots).toEqual([
      { time: '08:00', type: 'morning', format: 'auto', channels: [] },
      { time: '13:30', type: 'midday', format: 'auto', channels: [] },
      { time: '19:00', type: 'evening', format: 'auto', channels: [] },
    ]);
  });

  it('reads the format and channels of a slot', () => {
    expect(parseSlots(['09:15|morning|calendar|main, en ', '10:00|midday|fancy|', '11:00|evening||ru'])).toEqual([
      { time: '09:15', type: 'morning', format: 'calendar', channels: ['main', 'en'] },
      { time: '10:00', type: 'midday', format: 'auto', channels: [] },
      { time: '11:00', type: 'evening', format: 'auto', channels: ['ru'] },
    ]);
  });

  it('reads day, time and weekend in a timezone', () => {
    const p = zonedParts(new Date('2026-10-24T21:30:00Z'), 'Europe/Moscow'); // Sunday 00:30 in Moscow
    expect(p).toEqual({ day: '2026-10-25', minutes: 30, weekend: true });
    expect(zonedParts(new Date('2026-10-21T10:00:00Z'), 'Not/AZone').minutes).toBe(600); // falls back to UTC
  });

  it('finds due slots, skipping posted and long-missed ones', () => {
    const at = (iso: string) => new Date(iso);
    expect(dueSlots(at('2026-10-21T08:05:00Z'), 'UTC', slots, new Set()).map((s) => s.time)).toEqual(['08:00']);
    expect(dueSlots(at('2026-10-21T08:05:00Z'), 'UTC', slots, new Set(['08:00']))).toEqual([]);
    expect(dueSlots(at('2026-10-21T12:00:00Z'), 'UTC', slots, new Set())).toEqual([]); // morning was >90 min ago
    expect(dueSlots(at('2026-10-21T05:05:00Z'), 'Europe/Moscow', slots, new Set()).map((s) => s.time)).toEqual(['08:00']);
  });

  it('knows the next slot', () => {
    expect(nextSlot(new Date('2026-10-21T09:00:00Z'), 'UTC', slots)?.time).toBe('13:30');
    expect(nextSlot(new Date('2026-10-21T20:00:00Z'), 'UTC', slots)?.time).toBe('08:00');
  });
});

describe('news sources', () => {
  it('parses RSS items', () => {
    const xml = `<rss><channel><item><title><![CDATA[Fed holds rates]]></title><description>&lt;p&gt;Powell says data-dependent&lt;/p&gt;</description><pubDate>Fri, 23 Oct 2026 18:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(xml)).toEqual(['Fri, 23 Oct 2026 18:00:00 GMT — Fed holds rates: Powell says data-dependent']);
  });

  it('parses Atom entries and ignores non-feeds', () => {
    expect(parseFeed('<feed><entry><title>ECB</title><summary>Hike</summary></entry></feed>')).toEqual(['ECB: Hike']);
    expect(parseFeed('<html><body>hi</body></html>')).toEqual([]);
  });

  it('turns HTML and JSON into text', () => {
    expect(toPlainText('<html><script>x()</script><h1>EUR/USD</h1> <p>rises</p></html>')).toBe('EUR/USD rises');
    expect(toPlainText('{"a": [1, 2]}')).toBe('{"a":[1,2]}');
  });

  it('keeps only http(s) URLs', () => {
    expect(parseSourceUrls('https://a.com/rss\n  \nnot a url\nhttp://b.org/x ')).toEqual(['https://a.com/rss', 'http://b.org/x']);
  });
});

describe('OpenAI errors', () => {
  const rate = { status: 429, code: 'rate_limit_exceeded', message: 'Rate limit reached for gpt-5 on tokens per min (TPM): Limit 10000, Used 4466, Requested 9425. Please try again in 23.346s.' };

  it('tells a per-minute limit apart from no credits', () => {
    expect(isRateLimit(rate)).toBe(true);
    expect(isRateLimit({ status: 429, code: 'insufficient_quota', message: 'You exceeded your current quota' })).toBe(false);
    expect(isRateLimit({ status: 401, message: 'bad key' })).toBe(false);
  });

  it('waits as long as OpenAI asks, capped', () => {
    expect(retryDelayMs(rate)).toBe(24_346);
    expect(retryDelayMs({ message: 'Please try again in 820ms.' })).toBe(1_820);
    expect(retryDelayMs({ message: 'Please try again in 1m5s.' })).toBe(30_000);
    expect(retryDelayMs({ message: 'slow down', headers: { 'retry-after': '3' } })).toBe(4_000);
  });

  it('explains the error in plain words', () => {
    expect(friendlyOpenAiError(rate)).toMatch(/^OpenAI's per-minute limit/);
    expect(friendlyOpenAiError({ status: 429, code: 'insufficient_quota', message: 'quota' })).toMatch(/no credits/);
    expect(friendlyOpenAiError({ status: 401, message: 'invalidated' })).toMatch(/rejected the API key/);
    expect(friendlyOpenAiError(new Error('boom'))).toBe('boom');
  });
});

describe('news text cleanup', () => {
  it('removes web-search citations, links and URLs', () => {
    const raw =
      'Watch GBP and EUR knee-jerks. ([macrosetup.com](https://www.macrosetup.com/economic-calendar?utm_source=openai))\n' +
      'Fed decision on Oct 28 — USD jumpy. ([platform.generalassets.eu](https://platform.generalassets.eu/calendar?utm_source=openai))\n' +
      'More at https://example.com/x and [here](https://a.b/c) too.';
    expect(cleanNewsText(raw)).toBe('Watch GBP and EUR knee-jerks.\nFed decision on Oct 28 — USD jumpy.\nMore at and too.');
  });

  it('cleans the text inside the AI reply', () => {
    const reply = JSON.stringify({ text: 'EUR/USD holds 1.08. ([fxstreet.com](https://fxstreet.com?utm_source=openai))', pair: 'EUR/USD' });
    expect(parseNewsReply(reply)).toEqual({ headline: '', text: 'EUR/USD holds 1.08.', bullets: [], pair: 'EUR/USD', levels: [], events: [] });
  });

  it('drops broken levels and events and falls back to EUR/USD', () => {
    const r = parseNewsReply(JSON.stringify({
      text: 'x', pair: 'BTC/USD', bullets: ['a', ''],
      levels: [{ label: 'Support', price: 1.07 }, { label: 'Bad', price: 'n/a' }],
      events: [{ time: '14:30', currency: 'usd', title: 'CPI', expected: '3.1%' }, { time: '', currency: 'EUR', title: 'x', expected: '' }],
    }));
    expect(r.pair).toBe('EUR/USD');
    expect(r.bullets).toEqual(['a']);
    expect(r.levels).toEqual([{ label: 'Support', price: 1.07 }]);
    expect(r.events).toEqual([{ time: '14:30', currency: 'USD', title: 'CPI', expected: '3.1%' }]);
  });

  it('keeps numbers from the original when merging a translation', () => {
    const orig: NewsReply = { headline: 'Hi', text: 'Text', bullets: ['a', 'b'], pair: 'GBP/USD', levels: [{ label: 'Support', price: 1.25 }], events: [{ time: '14:30', currency: 'USD', title: 'CPI', expected: '3%' }] };
    const tr: NewsReply = { headline: 'Привет', text: 'Текст', bullets: ['а'], pair: 'EUR/USD', levels: [{ label: 'Поддержка', price: 9 }], events: [{ time: '9', currency: 'X', title: 'ИПЦ', expected: '' }] };
    expect(mergeTranslation(orig, tr)).toEqual({
      headline: 'Привет', text: 'Текст', bullets: ['a', 'b'], pair: 'GBP/USD',
      levels: [{ label: 'Поддержка', price: 1.25 }], events: [{ time: '14:30', currency: 'USD', title: 'ИПЦ', expected: '3%' }],
    });
  });
});

describe('news formats', () => {
  const reply = (over: Partial<NewsReply> = {}): NewsReply => ({ headline: '', text: 'Body <ok> & more', bullets: [], pair: 'EUR/USD', levels: [], events: [], ...over });

  it('rotates away from the last two formats', () => {
    for (let i = 0; i < 20; i++) {
      const f = pickFormat('morning', ['calendar', 'bullets'], () => i / 20);
      expect(['levels', 'story']).toContain(f);
    }
    expect(pickFormat('evening', ['movers', 'bullets', 'story'], () => 0.99)).toBe('story');
    expect(pickFormat('evening', ['movers', 'bullets'], () => 0)).toBe('story');
  });

  it('falls back when a format has nothing to show', () => {
    expect(settleFormat('calendar', reply(), [])).toBe('story');
    expect(settleFormat('calendar', reply({ bullets: ['x'] }), [])).toBe('bullets');
    expect(settleFormat('movers', reply(), [{ pair: 'EUR/USD', change: 1 }])).toBe('story');
    expect(settleFormat('bullets', reply(), [])).toBe('story');
    expect(settleFormat('levels', reply(), [])).toBe('levels');
  });

  it('builds escaped Telegram HTML for each format', () => {
    expect(formatPost('story', reply(), 'en')).toBe('Body &lt;ok&gt; &amp; more');
    expect(formatPost('quick', reply(), 'en')).toBe('⚡️ Body &lt;ok&gt; &amp; more');
    expect(formatPost('bullets', reply({ headline: 'A & B', bullets: ['🔥 Hot', 'Plain'] }), 'en')).toBe('<b>A &amp; B</b>\n\n🔥 Hot\n• Plain\n\nBody &lt;ok&gt; &amp; more');
    expect(formatPost('levels', reply({ headline: 'Tight range', levels: [{ label: 'Support', price: 1.07 }, { label: 'Resistance', price: 1.0912345 }] }), 'en')).toBe(
      '<b>📍 EUR/USD — Tight range</b>\n\nBody &lt;ok&gt; &amp; more\n\n▫️ Resistance: <b>1.09123</b>\n▫️ Support: <b>1.07000</b>',
    );
    expect(formatPost('calendar', reply({ headline: 'Today', events: [{ time: '14:30', currency: 'USD', title: 'CPI', expected: '3.1%' }] }), 'ru')).toBe(
      '<b>🗓 Today</b>\n\n🕐 <b>14:30</b> · USD — CPI (прогноз 3.1%)\n\nBody &lt;ok&gt; &amp; more',
    );
    expect(formatPost('movers', reply({ headline: 'Yen day' }), 'en', [{ pair: 'USD/JPY', change: -0.5 }, { pair: 'EUR/USD', change: 0.123 }])).toBe(
      '<b>📊 Yen day</b>\n\n🟢 EUR/USD  <b>+0.12%</b>\n🔴 USD/JPY  <b>-0.50%</b>\n\nBody &lt;ok&gt; &amp; more',
    );
  });

  it('labels chart levels R/S from the nearest out', () => {
    expect(shortLevelLabels([{ price: 1.2 }, { price: 1.1 }, { price: 0.9 }, { price: 0.95 }], 1)).toEqual([
      { label: 'R1', price: 1.1 }, { label: 'R2', price: 1.2 }, { label: 'S1', price: 0.95 }, { label: 'S2', price: 0.9 },
    ]);
  });
});

describe('news channels', () => {
  const base = { channels: [], channelId: '@old', channelUrl: 'https://t.me/old', language: 'ru', websiteChannel: '' } as any;

  it('uses the legacy channel until channels are added', () => {
    expect(newsChannels(base)).toEqual([{ key: 'main', name: '@old', chatId: '@old', url: 'https://t.me/old', language: 'ru', enabled: true }]);
    expect(websiteNewsUrl(base)).toBe('https://t.me/old');
  });

  it('cleans configured channels and picks the website link', () => {
    const cfg = {
      ...base,
      websiteChannel: 'en',
      channels: [
        { key: 'ru', name: '', chatId: ' @ru ', url: 'https://t.me/ru', language: 'xx', enabled: true },
        { key: 'en', name: 'EN', chatId: '@en', url: 'https://t.me/en', language: 'en', enabled: false },
        { key: 'bad', name: 'No chat', chatId: '', url: '', language: 'en', enabled: true },
      ],
    };
    expect(newsChannels(cfg).map((c) => [c.key, c.name, c.chatId, c.language, c.enabled])).toEqual([
      ['ru', '@ru', '@ru', 'ru', true],
      ['en', 'EN', '@en', 'en', false],
    ]);
    expect(websiteNewsUrl(cfg)).toBe('https://t.me/en');
    expect(websiteNewsUrl({ ...cfg, websiteChannel: 'gone' })).toBe('https://t.me/ru');
  });
});
