import { langForCountry, visitorCountry } from './geo-lang';

describe('language by country', () => {
  it('maps Spanish- and English-speaking countries, Russian otherwise', () => {
    expect(['ES', 'mx', 'AR'].map(langForCountry)).toEqual(['es', 'es', 'es']);
    expect(['US', 'GB', 'ca', 'SG', 'IN', 'PK'].map(langForCountry)).toEqual(['en', 'en', 'en', 'en', 'en', 'en']);
    expect(['RU', 'KZ', 'XX', '', null, undefined].map(langForCountry)).toEqual(['ru', 'ru', 'ru', 'ru', 'ru', 'ru']);
  });

  it('gives each main visitor country its own language', () => {
    const cases: Record<string, string> = {
      AM: 'hy', CN: 'zh', HK: 'zh', KR: 'ko', JP: 'ja', ID: 'id', DE: 'de', FR: 'fr',
      PL: 'pl', RO: 'ro', BR: 'pt', TR: 'tr', AE: 'ar', BG: 'bg',
    };
    for (const [cc, lang] of Object.entries(cases)) expect([cc, langForCountry(cc)]).toEqual([cc, lang]);
  });

  it('reads the country from Cloudflare or the IP', () => {
    const req = (headers: Record<string, string>, ip?: string) => ({ headers, ip }) as any;
    expect(visitorCountry(req({ 'cf-ipcountry': 'mx' }, '8.8.8.8'))).toBe('MX');
    expect(visitorCountry(req({ 'cf-ipcountry': 'XX' }, '88.0.0.1'))).toBe('ES');
    expect(visitorCountry(req({}, '::ffff:8.8.8.8'))).toBe('US');
    expect(visitorCountry(req({}, '127.0.0.1'))).toBeNull();
  });
});
