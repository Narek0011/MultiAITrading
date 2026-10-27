import { Lang } from '../settings/settings.types';

/** Labels around the Terms and Privacy pages; the page texts themselves are in settings (Admin → Legal pages). */
export const LEGAL_LABELS: Record<Lang, { termsLink: string; privacyLink: string; back: string }> = {
  en: { termsLink: 'Terms', privacyLink: 'Privacy', back: '← Back to the website' },
  ru: { termsLink: 'Условия', privacyLink: 'Конфиденциальность', back: '← Вернуться на сайт' },
  es: { termsLink: 'Términos', privacyLink: 'Privacidad', back: '← Volver al sitio' },
};
