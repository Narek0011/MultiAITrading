import { NewsCardRendererService } from '../charts/news-card-renderer.service';
import { PeriodStats } from '../signals/period-stats';
import { stripPremiumEmoji } from '../telegram/premium-emoji';
import { periodLabel, statsCaption, statsCard } from './stats-post';

const stats: PeriodStats = {
  period: '7d',
  wins: 23,
  losses: 5,
  neutral: 1,
  winRate: 82,
  pips: 0,
  bestStreak: 9,
  topPairs: [{ pair: 'GBP/CAD', wins: 4, total: 4, winRate: 100 }, { pair: 'EUR/USD', wins: 7, total: 8, winRate: 88 }],
  recent: [{ pair: 'GBP/CAD', direction: 'BUY', win: true }, { pair: 'EUR/USD', direction: 'SELL', win: true }, { pair: 'USD/JPY', direction: 'BUY', win: false }],
};
const now = new Date('2026-11-06T12:00:00Z');

describe('statistics post', () => {
  it('labels the period with its dates', () => {
    expect(periodLabel('7d', 'en', now)).toBe('Last 7 days · 31.10 – 06.11');
    expect(periodLabel('today', 'ru', now)).toBe('Сегодня · 06.11');
    expect(periodLabel('all', 'hy', now)).toBe('Ամբողջ ժամանակ');
  });

  it('captions fit a Telegram photo caption in every language and list only wins as latest results', () => {
    for (const lang of ['en', 'ru', 'es', 'hy'] as const) {
      const html = statsCaption(stats, lang, now);
      expect(html.replace(/<[^>]+>/g, '').length).toBeLessThan(1024);
      expect(html).toContain('82%');
      expect(html).not.toContain('USD/JPY');
    }
  });

  it('uses the Premium check, loss, fire and money emoji, plain when stripped for the bot', () => {
    const html = statsCaption({ ...stats, pips: 412 }, 'hy', now);
    expect(html).toContain('<tg-emoji emoji-id="5913273744356283222">✅</tg-emoji> Հաղթանակներ');
    expect(html).toContain('<tg-emoji emoji-id="5188344996356448758">🏆</tg-emoji> <b>');
    expect(html).toContain('<tg-emoji emoji-id="5454350746407419714">❌</tg-emoji>');
    expect(html).toContain('<tg-emoji emoji-id="5289722755871162900">🔥</tg-emoji>');
    expect(html).toContain('<tg-emoji emoji-id="5417924076503062111">💰</tg-emoji>');
    expect(html).toContain('<tg-emoji emoji-id="5913273744356283222">✅</tg-emoji> GBP/CAD 📈');
    const plain = stripPremiumEmoji(html);
    expect(plain).not.toContain('tg-emoji');
    expect(plain).toContain('✅ GBP/CAD 📈');
    expect(plain).toContain('💰');
  });

  it('shows signals count instead of pips when there are no pips (expiry style)', () => {
    expect(statsCard(stats, 'en', now).tiles[3]).toEqual({ label: 'Signals', value: '28', tone: 'plain' });
    expect(statsCard({ ...stats, pips: 412 }, 'en', now).tiles[3].value).toBe('+412');
  });

  it('renders the card as PNG in en, ru and hy', () => {
    const r = new NewsCardRendererService();
    for (const lang of ['en', 'ru', 'hy'] as const) {
      expect(r.statsPng(statsCard(stats, lang, now)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    expect(r.statsSvg({ ...statsCard(stats, 'en', now), topPairs: [{ pair: '<b>X', winRate: 50 }] })).toContain('&lt;b&gt;X');
  });
});
