import { dueSlots, nextSlot, parseSlots, zonedParts } from './news-schedule';
import { parseFeed, parseSourceUrls, toPlainText } from './news-sources';

describe('news schedule', () => {
  const slots = parseSlots(['19:00|evening', '8:00|morning', '13:30|midday', 'bad', '25:00|morning', '10:00|lunch']);

  it('parses, validates and sorts slots', () => {
    expect(slots).toEqual([
      { time: '08:00', type: 'morning' },
      { time: '13:30', type: 'midday' },
      { time: '19:00', type: 'evening' },
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
