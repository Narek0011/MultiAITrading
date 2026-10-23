import { Lang } from '../../settings/settings.types';
import { Dictionary, en } from './en';
import { es } from './es';
import { ru } from './ru';

export const DICTIONARIES: Record<Lang, Dictionary> = { en, ru, es };
export const LANGS: Lang[] = ['en', 'ru', 'es'];
