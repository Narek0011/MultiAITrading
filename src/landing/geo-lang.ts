import { Request } from 'express';
import { SiteLang } from '../settings/settings.types';

// Offline country database (no network call per visit). Has no type definitions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const geoip: { lookup(ip: string): { country: string } | null } = require('geoip-country');

const COUNTRY_LANGS: [SiteLang, string[]][] = [
  ['es', ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ']],
  ['en', ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA', 'SG', 'PH', 'IN', 'PK', 'NG', 'KE', 'GH', 'JM', 'TT', 'MT']],
  ['hy', ['AM']],
  ['zh', ['CN', 'HK', 'TW', 'MO']],
  ['ko', ['KR']],
  ['ja', ['JP']],
  ['id', ['ID']],
  ['de', ['DE', 'AT', 'CH', 'LI']],
  ['fr', ['FR', 'BE', 'LU', 'MC', 'SN', 'CI', 'CM', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GA', 'CG', 'CD', 'MG', 'HT']],
  ['pl', ['PL']],
  ['ro', ['RO', 'MD']],
  ['pt', ['BR', 'PT', 'AO', 'MZ']],
  ['tr', ['TR']],
  ['ar', ['AE', 'SA', 'EG', 'QA', 'KW', 'BH', 'OM', 'JO', 'LB', 'IQ', 'MA', 'DZ', 'TN', 'LY', 'YE', 'SY', 'PS', 'SD']],
  ['bg', ['BG']],
];
const LANG_BY_COUNTRY = new Map(COUNTRY_LANGS.flatMap(([lang, countries]) => countries.map((cc) => [cc, lang] as const)));

/** Website language for a visitor's country; countries without their own language get Russian. */
export function langForCountry(country: string | null | undefined): SiteLang {
  return LANG_BY_COUNTRY.get((country ?? '').toUpperCase()) ?? 'ru';
}

/** Visitor country: Cloudflare's header when the site is behind it, otherwise a lookup of the client IP. */
export function visitorCountry(req: Request): string | null {
  const cf = req.headers['cf-ipcountry'];
  if (typeof cf === 'string' && /^[A-Z]{2}$/i.test(cf) && cf.toUpperCase() !== 'XX') return cf.toUpperCase();
  const ip = (req.ip ?? '').replace(/^::ffff:/, '');
  return ip ? (geoip.lookup(ip)?.country ?? null) : null;
}
