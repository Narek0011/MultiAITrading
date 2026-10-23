import { Lang } from '../settings/settings.types';

export const LANGUAGE_PROMPT = '🌐 <b>Choose your language</b>\n🌐 <b>Выберите язык</b>\n🌐 <b>Elige tu idioma</b>';

export const LANGUAGE_BUTTONS: { lang: Lang; label: string }[] = [
  { lang: 'en', label: '🇬🇧 English' },
  { lang: 'ru', label: '🇷🇺 Русский' },
  { lang: 'es', label: '🇪🇸 Español' },
];

export const BUTTON_LABELS: Record<Lang, { channel: string; support: string; language: string }> = {
  en: { channel: '📈 Signals channel', support: '💬 Contact support', language: '🌐 Change language' },
  ru: { channel: '📈 Канал сигналов', support: '💬 Написать в поддержку', language: '🌐 Сменить язык' },
  es: { channel: '📈 Canal de señales', support: '💬 Contactar soporte', language: '🌐 Cambiar idioma' },
};
