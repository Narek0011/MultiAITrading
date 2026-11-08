import { SiteLang } from '../settings/settings.types';

/** Labels around the Terms and Privacy pages; the page texts themselves are in settings (Admin → Legal pages). */
export const LEGAL_LABELS: Record<SiteLang, { termsLink: string; privacyLink: string; back: string }> = {
  en: { termsLink: 'Terms', privacyLink: 'Privacy', back: '← Back to the website' },
  ru: { termsLink: 'Условия', privacyLink: 'Конфиденциальность', back: '← Вернуться на сайт' },
  es: { termsLink: 'Términos', privacyLink: 'Privacidad', back: '← Volver al sitio' },
  hy: { termsLink: 'Պայմաններ', privacyLink: 'Գաղտնիություն', back: '← Վերադառնալ կայք' },
  de: { termsLink: 'AGB', privacyLink: 'Datenschutz', back: '← Zurück zur Website' },
  fr: { termsLink: 'Conditions', privacyLink: 'Confidentialité', back: '← Retour au site' },
  pt: { termsLink: 'Termos', privacyLink: 'Privacidade', back: '← Voltar ao site' },
  pl: { termsLink: 'Regulamin', privacyLink: 'Prywatność', back: '← Powrót do strony' },
  ro: { termsLink: 'Termeni', privacyLink: 'Confidențialitate', back: '← Înapoi la site' },
  bg: { termsLink: 'Условия', privacyLink: 'Поверителност', back: '← Обратно към сайта' },
  tr: { termsLink: 'Koşullar', privacyLink: 'Gizlilik', back: '← Siteye dön' },
  ar: { termsLink: 'الشروط', privacyLink: 'الخصوصية', back: 'العودة إلى الموقع →' },
  zh: { termsLink: '条款', privacyLink: '隐私', back: '← 返回网站' },
  ja: { termsLink: '利用規約', privacyLink: 'プライバシー', back: '← サイトに戻る' },
  ko: { termsLink: '이용약관', privacyLink: '개인정보', back: '← 사이트로 돌아가기' },
  id: { termsLink: 'Ketentuan', privacyLink: 'Privasi', back: '← Kembali ke situs' },
};
