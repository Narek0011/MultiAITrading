import { Lang } from '../settings/settings.types';

export type LegalPage = 'terms' | 'privacy';

interface LegalText {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}

/** Terms of service and privacy policy (needed by TikTok and other platforms that review the app). */
export const LEGAL: Record<Lang, Record<LegalPage, LegalText> & { termsLink: string; privacyLink: string; back: string }> = {
  en: {
    termsLink: 'Terms',
    privacyLink: 'Privacy',
    back: '← Back to the website',
    terms: {
      title: 'Terms of Service',
      updated: 'Last updated: October 2026',
      sections: [
        { h: 'The service', p: ['MultiAI Trading publishes AI-generated forex analysis and example trading signals through our website, Telegram channels and social media accounts.'] },
        { h: 'Not financial advice', p: ['Everything we publish is for information and education only. It is not investment advice or a recommendation to buy or sell anything. You decide on and are responsible for your own trades.'] },
        { h: 'Risk', p: ['Trading foreign exchange on margin carries a high level of risk and may not be suitable for everyone. You can lose more than you deposit. Past results do not guarantee future results.'] },
        { h: 'Use of content', p: ['You may share our public posts with a link to the source. You may not resell our signals or present them as your own.'] },
        { h: 'Changes', p: ['We may change these terms or the service at any time. Continued use means you accept the current terms.'] },
        { h: 'Contact', p: ['Questions: write to us through the support link on our website.'] },
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      updated: 'Last updated: October 2026',
      sections: [
        { h: 'What we collect', p: ['Website: your chosen language (cookie) and your approximate country from your IP address to show the right language. We do not sell or share this.', 'Telegram bot: your Telegram user id, username and the account id you send us to get access to the signals channel.'] },
        { h: 'Social media (TikTok)', p: ['We connect our own TikTok account to publish our posts. We store only the access tokens TikTok gives us for that account and the posts we create. We do not collect data about TikTok viewers.'] },
        { h: 'How we use it', p: ['Only to run the service: show the website in your language, give access to our channels and publish our content.'] },
        { h: 'Storage and deletion', p: ['Data is stored on our servers. Ask us through the support link and we will delete your data.'] },
        { h: 'Contact', p: ['Questions about privacy: write to us through the support link on our website.'] },
      ],
    },
  },
  ru: {
    termsLink: 'Условия',
    privacyLink: 'Конфиденциальность',
    back: '← Вернуться на сайт',
    terms: {
      title: 'Условия использования',
      updated: 'Обновлено: октябрь 2026',
      sections: [
        { h: 'Сервис', p: ['MultiAI Trading публикует форекс-аналитику и примеры торговых сигналов, созданные ИИ, на сайте, в Telegram-каналах и в социальных сетях.'] },
        { h: 'Не финансовый совет', p: ['Всё, что мы публикуем, носит информационный и образовательный характер. Это не инвестиционная рекомендация. Решения о сделках вы принимаете сами и сами за них отвечаете.'] },
        { h: 'Риски', p: ['Маржинальная торговля на рынке форекс связана с высоким риском и подходит не всем. Можно потерять больше, чем вложено. Прошлые результаты не гарантируют будущих.'] },
        { h: 'Использование материалов', p: ['Можно делиться нашими публичными постами со ссылкой на источник. Нельзя перепродавать наши сигналы или выдавать их за свои.'] },
        { h: 'Изменения', p: ['Мы можем менять условия и сервис в любое время. Продолжая пользоваться сервисом, вы принимаете текущие условия.'] },
        { h: 'Контакты', p: ['Вопросы — пишите нам через ссылку поддержки на сайте.'] },
      ],
    },
    privacy: {
      title: 'Политика конфиденциальности',
      updated: 'Обновлено: октябрь 2026',
      sections: [
        { h: 'Что мы собираем', p: ['Сайт: выбранный язык (cookie) и примерную страну по IP-адресу, чтобы показать нужный язык. Мы не продаём и не передаём эти данные.', 'Telegram-бот: ваш Telegram ID, имя пользователя и ID аккаунта, который вы отправляете для доступа к каналу сигналов.'] },
        { h: 'Социальные сети (TikTok)', p: ['Мы подключаем свой аккаунт TikTok, чтобы публиковать наши посты. Мы храним только токены доступа TikTok для этого аккаунта и созданные нами посты. Данные зрителей TikTok мы не собираем.'] },
        { h: 'Как мы используем данные', p: ['Только для работы сервиса: показать сайт на вашем языке, дать доступ к каналам и публиковать наш контент.'] },
        { h: 'Хранение и удаление', p: ['Данные хранятся на наших серверах. Напишите нам через ссылку поддержки — и мы удалим ваши данные.'] },
        { h: 'Контакты', p: ['Вопросы о конфиденциальности — пишите через ссылку поддержки на сайте.'] },
      ],
    },
  },
  es: {
    termsLink: 'Términos',
    privacyLink: 'Privacidad',
    back: '← Volver al sitio',
    terms: {
      title: 'Términos de servicio',
      updated: 'Última actualización: octubre de 2026',
      sections: [
        { h: 'El servicio', p: ['MultiAI Trading publica análisis de forex y señales de ejemplo generados por IA en nuestro sitio web, canales de Telegram y redes sociales.'] },
        { h: 'No es asesoramiento financiero', p: ['Todo lo que publicamos es solo informativo y educativo. No es una recomendación de inversión. Tú decides tus operaciones y eres responsable de ellas.'] },
        { h: 'Riesgo', p: ['Operar divisas con margen conlleva un alto riesgo y puede no ser adecuado para todos. Puedes perder más de lo que depositas. Los resultados pasados no garantizan resultados futuros.'] },
        { h: 'Uso del contenido', p: ['Puedes compartir nuestras publicaciones con un enlace a la fuente. No puedes revender nuestras señales ni presentarlas como propias.'] },
        { h: 'Cambios', p: ['Podemos cambiar estos términos o el servicio en cualquier momento. Si sigues usándolo, aceptas los términos vigentes.'] },
        { h: 'Contacto', p: ['Preguntas: escríbenos a través del enlace de soporte del sitio.'] },
      ],
    },
    privacy: {
      title: 'Política de privacidad',
      updated: 'Última actualización: octubre de 2026',
      sections: [
        { h: 'Qué recopilamos', p: ['Sitio web: el idioma elegido (cookie) y tu país aproximado según la IP para mostrar el idioma correcto. No vendemos ni compartimos estos datos.', 'Bot de Telegram: tu ID y nombre de usuario de Telegram y el ID de cuenta que nos envías para acceder al canal de señales.'] },
        { h: 'Redes sociales (TikTok)', p: ['Conectamos nuestra propia cuenta de TikTok para publicar nuestros posts. Solo guardamos los tokens de acceso de esa cuenta y las publicaciones que creamos. No recopilamos datos de los espectadores de TikTok.'] },
        { h: 'Cómo los usamos', p: ['Solo para el servicio: mostrar el sitio en tu idioma, dar acceso a nuestros canales y publicar nuestro contenido.'] },
        { h: 'Almacenamiento y eliminación', p: ['Los datos se guardan en nuestros servidores. Escríbenos por el enlace de soporte y los eliminaremos.'] },
        { h: 'Contacto', p: ['Preguntas sobre privacidad: escríbenos por el enlace de soporte del sitio.'] },
      ],
    },
  },
};
