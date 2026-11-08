import { SiteLang } from '../../settings/settings.types';
import { ar } from './ar';
import { bg } from './bg';
import { de } from './de';
import { Dictionary, en } from './en';
import { es } from './es';
import { fr } from './fr';
import { hy } from './hy';
import { id } from './id';
import { ja } from './ja';
import { ko } from './ko';
import { pl } from './pl';
import { pt } from './pt';
import { ro } from './ro';
import { ru } from './ru';
import { tr } from './tr';
import { zh } from './zh';

export const DICTIONARIES: Record<SiteLang, Dictionary> = { en, ru, es, hy, zh, ko, ja, id, de, fr, pl, ro, pt, tr, ar, bg };
export const LANGS: SiteLang[] = ['en', 'ru', 'es', 'hy', 'de', 'fr', 'pt', 'pl', 'ro', 'bg', 'tr', 'ar', 'zh', 'ja', 'ko', 'id'];
/** Each language's own name, for the language menu. */
export const LANG_NAMES: Record<SiteLang, string> = {
  en: 'English', ru: 'Русский', es: 'Español', hy: 'Հայերեն', de: 'Deutsch', fr: 'Français', pt: 'Português', pl: 'Polski',
  ro: 'Română', bg: 'Български', tr: 'Türkçe', ar: 'العربية', zh: '中文', ja: '日本語', ko: '한국어', id: 'Bahasa Indonesia',
};
/** Languages written right to left. */
export const RTL_LANGS: SiteLang[] = ['ar'];
