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

export interface AccessTexts {
  getAccess: string;
  register: string;
  registered: string;
  joinChannel: string;
  back: string;
  askId: string;
  badId: string;
  pending: string;
  approved: string;
  rejected: string;
  notApproved: string;
  unavailable: string;
}

export const ACCESS_TEXTS: Record<Lang, AccessTexts> = {
  en: {
    getAccess: '🔐 Get signals access',
    register: '📝 Register on Pocket Option',
    registered: '✅ I registered',
    joinChannel: '📈 Join the signals channel',
    back: '⬅️ Back',
    askId: '✍️ Send your <b>Pocket Option account ID</b> (digits only) in one message.',
    badId: '⚠️ That doesn’t look like a Pocket Option ID. Send only the digits, e.g. <code>12345678</code>.',
    pending: '⏳ Thanks! Your ID <code>{id}</code> is being checked. You’ll get the channel link here as soon as it’s approved.',
    approved: '🎉 <b>Access approved!</b>\n\nTap the button below and send a join request — it is accepted automatically.',
    rejected: '❌ We couldn’t find ID <code>{id}</code> registered with our link.\n\nRegister with the button below and send the new account ID.',
    notApproved: '🔒 The signals channel is only for traders registered with our partner link. Get access here 👇',
    unavailable: 'Access requests are not open yet — please contact support.',
  },
  ru: {
    getAccess: '🔐 Получить доступ к сигналам',
    register: '📝 Регистрация на Pocket Option',
    registered: '✅ Я зарегистрировался',
    joinChannel: '📈 Вступить в канал сигналов',
    back: '⬅️ Назад',
    askId: '✍️ Отправьте <b>ID аккаунта Pocket Option</b> (только цифры) одним сообщением.',
    badId: '⚠️ Это не похоже на ID Pocket Option. Отправьте только цифры, например <code>12345678</code>.',
    pending: '⏳ Спасибо! Ваш ID <code>{id}</code> на проверке. Как только его одобрят, ссылка на канал придёт сюда.',
    approved: '🎉 <b>Доступ одобрен!</b>\n\nНажмите кнопку ниже и отправьте заявку — она будет принята автоматически.',
    rejected: '❌ ID <code>{id}</code> не найден среди регистраций по нашей ссылке.\n\nЗарегистрируйтесь по кнопке ниже и отправьте ID нового аккаунта.',
    notApproved: '🔒 Канал сигналов доступен только трейдерам, зарегистрированным по нашей партнёрской ссылке. Получить доступ 👇',
    unavailable: 'Заявки на доступ пока не принимаются — напишите в поддержку.',
  },
  es: {
    getAccess: '🔐 Obtener acceso a señales',
    register: '📝 Registrarse en Pocket Option',
    registered: '✅ Ya me registré',
    joinChannel: '📈 Unirse al canal de señales',
    back: '⬅️ Atrás',
    askId: '✍️ Envía tu <b>ID de cuenta de Pocket Option</b> (solo dígitos) en un mensaje.',
    badId: '⚠️ Eso no parece un ID de Pocket Option. Envía solo los dígitos, p. ej. <code>12345678</code>.',
    pending: '⏳ ¡Gracias! Estamos verificando tu ID <code>{id}</code>. Recibirás aquí el enlace del canal en cuanto se apruebe.',
    approved: '🎉 <b>¡Acceso aprobado!</b>\n\nPulsa el botón de abajo y envía la solicitud — se acepta automáticamente.',
    rejected: '❌ No encontramos el ID <code>{id}</code> registrado con nuestro enlace.\n\nRegístrate con el botón de abajo y envía el ID de la nueva cuenta.',
    notApproved: '🔒 El canal de señales es solo para traders registrados con nuestro enlace de socio. Obtén acceso aquí 👇',
    unavailable: 'Las solicitudes de acceso aún no están abiertas — contacta con soporte.',
  },
};
