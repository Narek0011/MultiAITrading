import { clientIp, deviceOf, isBot, referrerHost, visitPeriodStart } from './visits';

const req = (headers: Record<string, string>, ip?: string) => ({ headers, ip });

describe('website visits', () => {
  it('takes the real visitor IP (Cloudflare header first, IPv4-mapped prefix removed)', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '5.6.7.8' }, '172.70.1.1'))).toBe('5.6.7.8');
    expect(clientIp(req({}, '::ffff:8.8.8.8'))).toBe('8.8.8.8');
    expect(clientIp(req({}, '2a00:1450::1'))).toBe('2a00:1450::1');
    expect(clientIp(req({}))).toBe('');
  });

  it('does not count bots and link previews, but counts Telegram in-app browsers', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBot('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isBot('curl/8.4.0')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Telegram-Android/10.5.0')).toBe(false);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.1 Mobile/15E148 Safari/604.1')).toBe(false);
  });

  it('tells phones from computers', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14) Mobile Safari')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) Safari/605.1.15')).toBe('desktop');
  });

  it('keeps only the site a visitor came from; our own pages count as direct', () => {
    expect(referrerHost('https://www.tiktok.com/@multiai/video/1', 'multiai.trade')).toBe('tiktok.com');
    expect(referrerHost('https://t.me/', 'multiai.trade')).toBe('t.me');
    expect(referrerHost('https://l.instagram.com/?u=x', 'multiai.trade')).toBe('instagram.com');
    expect(referrerHost('https://www.multiai.trade/privacy', 'multiai.trade:443')).toBeNull();
    expect(referrerHost('', 'multiai.trade')).toBeNull();
    expect(referrerHost('not a url', 'multiai.trade')).toBeNull();
  });

  it('starts periods at UTC midnight', () => {
    const now = new Date('2026-11-07T15:00:00Z');
    expect(visitPeriodStart('today', now).toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(visitPeriodStart('7d', now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(visitPeriodStart('90d', now).toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});
