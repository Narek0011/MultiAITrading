import { Request } from 'express';
import { Lang } from '../settings/settings.types';

// Offline country database (no network call per visit). Has no type definitions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const geoip: { lookup(ip: string): { country: string } | null } = require('geoip-country');

const SPANISH = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ']);
const ENGLISH = new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA', 'SG', 'PH', 'IN', 'NG', 'KE', 'GH', 'JM', 'TT', 'MT']);

/** Website language for a visitor's country: Spanish- and English-speaking countries get theirs, everyone else Russian. */
export function langForCountry(country: string | null | undefined): Lang {
  const cc = (country ?? '').toUpperCase();
  if (SPANISH.has(cc)) return 'es';
  if (ENGLISH.has(cc)) return 'en';
  return 'ru';
}

/** Visitor country: Cloudflare's header when the site is behind it, otherwise a lookup of the client IP. */
export function visitorCountry(req: Request): string | null {
  const cf = req.headers['cf-ipcountry'];
  if (typeof cf === 'string' && /^[A-Z]{2}$/i.test(cf) && cf.toUpperCase() !== 'XX') return cf.toUpperCase();
  const ip = (req.ip ?? '').replace(/^::ffff:/, '');
  return ip ? (geoip.lookup(ip)?.country ?? null) : null;
}
