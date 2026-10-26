import { NewsCardRendererService, wrapText } from './news-card-renderer.service';

const PNG = '89504e470d0a1a0a';

describe('NewsCardRendererService', () => {
  const cards = new NewsCardRendererService();

  it('renders a headline card and escapes the text', () => {
    const svg = cards.headlineSvg({ kicker: 'Morning brief', headline: 'Dollar <slips> & yen jumps', date: 'Mon, 26 October' });
    expect(svg).toContain('Dollar &lt;slips&gt; &amp; yen');
    expect(svg).toContain('MORNING BRIEF');
    expect(cards.headlinePng({ kicker: 'Итоги дня', headline: 'Очень длинный заголовок '.repeat(12), date: 'пн, 26 октября' }).subarray(0, 8).toString('hex')).toBe(PNG);
  });

  it('renders calendar and movers cards, even when empty', () => {
    const events = Array.from({ length: 9 }, (_, i) => ({ time: `1${i}:30`, currency: i % 2 ? 'usd' : 'EUR', title: `Event number ${i} with a fairly long name that must be cut`, expected: i % 3 ? '3.1%' : '' }));
    const cal = cards.calendarSvg({ title: 'Economic calendar', date: 'Mon', expectedLabel: 'exp.', events });
    expect(cal).toContain('USD');
    expect((cal.match(/:30</g) ?? []).length).toBe(7); // at most 7 rows
    expect(cards.calendarPng({ title: 'x', date: 'y', expectedLabel: 'exp.', events: [] }).subarray(0, 8).toString('hex')).toBe(PNG);
    const movers = cards.moversSvg({ title: 'Top movers', subtitle: '24h', movers: [{ pair: 'EUR/USD', change: -0.4 }, { pair: 'USD/JPY', change: 0.8 }] });
    expect(movers.indexOf('USD/JPY')).toBeLessThan(movers.indexOf('EUR/USD')); // biggest gainer first
    expect(movers).toContain('-0.40%');
    expect(cards.moversPng({ title: 'x', subtitle: 'y', movers: [] }).subarray(0, 8).toString('hex')).toBe(PNG);
  });

  it('wraps text into a limited number of lines', () => {
    expect(wrapText('one two three', 50, 2000, 3)).toEqual(['one two three']);
    const lines = wrapText('word '.repeat(100), 50, 400, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
  });
});
