/**
 * Default Terms of Service and Privacy Policy. The admin can edit them (Admin → Legal pages); these are the starting
 * texts and the "Reset to default" values.
 *
 * Format: "# Title" first line, "## Heading", "- " bullet lines, blank line between paragraphs, **bold**.
 * Placeholders: {company} {email} {support} {site} {updated}.
 */

const TERMS_EN = `# Terms of Service

Last updated: {updated}

These Terms of Service ("Terms") govern your use of the {company} website at {site}, our Telegram bot and channels, and our social media accounts (together, the "Service"). By using the Service you agree to these Terms. If you do not agree, please do not use the Service.

## 1. What we provide

{company} publishes forex market analysis, news and example trading signals that are generated with the help of artificial intelligence. A signal typically shows a currency pair, a direction, an entry level, take-profit targets and a stop loss, together with a chart.

We are **not a broker**, we do not execute trades, and we never hold, receive or manage your money. Any trading you do happens on third-party platforms that you choose, under their own terms.

## 2. Eligibility

You must be at least 18 years old and allowed by the laws of your country to use trading-related information and services. You are responsible for making sure that your use of the Service is legal where you live.

## 3. Not financial advice

All content — signals, analysis, news, posts and messages — is provided for **information and education only**. It is not investment, financial, legal or tax advice, and it is not a recommendation or an offer to buy or sell any financial instrument. We do not know your financial situation, goals or experience. You make your own decisions and you alone are responsible for them. If you need advice, consult a licensed professional.

## 4. Risk warning

Trading foreign exchange (forex) and other leveraged products carries a **high level of risk** and may not be suitable for everyone:

- You can lose some or all of your money, and with leverage losses can exceed your deposit.
- Market prices can move quickly; orders may be filled at worse prices than expected.
- Past performance, including any results we show, does not guarantee future results.
- Only trade with money you can afford to lose.

## 5. No guarantees and AI limitations

Our signals and analysis are produced by automated models and may be wrong, late or incomplete. Market data can contain errors or delays. We do not guarantee any profit, accuracy, win rate or availability of the Service, and we may change or stop any signal, channel or feature at any time.

## 6. Third-party services

The Service uses third-party platforms such as Telegram and TikTok, and may mention brokers or trading platforms. Your use of those platforms is governed by their own terms and privacy policies. We are not responsible for their content, availability, actions or for any account you open with them. Links to third parties do not mean we endorse them.

## 7. Access to our channels

Access to some channels may require you to follow the steps described by our bot (for example, registering through our partner link and sending us your account ID). We may approve, refuse or remove access at our discretion, for example if the information you provide cannot be verified or if you break these Terms.

## 8. Acceptable use

You agree not to:

- resell, republish or share our private signals or channel content without our written permission;
- present our content as your own or remove our branding;
- use the Service for anything illegal, fraudulent or harmful;
- spam, harass or impersonate others, or interfere with the Service or try to access it in unauthorised ways.

You may share our **public** posts with a link to the original source.

## 9. Intellectual property

The {company} name, logo, website, texts, charts, images and videos belong to us or our licensors and are protected by law. Except as allowed in these Terms, you may not copy, modify or distribute them.

## 10. Limitation of liability

To the fullest extent permitted by law, the Service is provided "as is" and "as available", without warranties of any kind. {company} and its team are not liable for any trading losses, lost profits or any direct, indirect or consequential damages arising from your use of, or reliance on, the Service. Nothing in these Terms limits liability that cannot be limited by law.

## 11. Suspension and termination

We may suspend or end your access to the Service, including channels and the bot, at any time if you break these Terms or if we stop offering the Service.

## 12. Changes to these Terms

We may update these Terms from time to time. The date at the top shows the latest version. If you keep using the Service after a change, you accept the updated Terms.

## 13. Contact

Questions about these Terms: {email}.`;

const PRIVACY_EN = `# Privacy Policy

Last updated: {updated}

This Privacy Policy explains what personal data {company} ("we", "us") collects when you use our website at {site}, our Telegram bot and channels, and our social media accounts, why we collect it and what rights you have.

## 1. Data we collect

**When you visit the website**

- Your chosen language, stored in a cookie so the site remembers it.
- Your approximate country, worked out from your IP address, only to show the site in the right language. We do not store your IP address for this.
- Standard technical logs kept by our server and hosting (such as IP address, browser type, pages requested and time), used for security and to keep the site working.

**When you use our Telegram bot**

- Your Telegram user ID, username, first name and language.
- Information you send to the bot, such as the trading-platform account ID you provide to request access to our channel, and your messages to us.
- The status of your access request (for example, pending, approved or rejected).

**Our social media accounts**

- We connect our **own** TikTok account to publish our posts. For that we store the access tokens TikTok gives us for our account and the posts we create. We do not collect personal data about people who view or interact with our TikTok posts through this connection.

We do not knowingly collect sensitive data, and we never ask for passwords, card numbers or access to your trading account.

## 2. Why we use your data

- To show the website in your language and keep it secure and working.
- To check and manage access to our Telegram channels.
- To reply to you and provide support.
- To publish our own content on our channels and social media accounts.

We do **not** sell your personal data and we do not use it for advertising profiles.

## 3. Legal basis

Where data protection laws such as the GDPR apply, we process data because it is necessary to provide the Service you request, for our legitimate interests (running and securing the Service), or with your consent where required.

## 4. Who we share data with

We share data only with service providers that help us run the Service, and only as needed:

- **Telegram**, which delivers our bot and channels.
- **TikTok**, where we publish our posts.
- **OpenAI**, which helps us write content and analysis. We do not send your personal data to it for that purpose.
- **Twelve Data**, our market data provider. It receives no personal data about you.
- Our **hosting** provider, which stores the website and its data.

We may also disclose data if the law requires it or to protect our rights and users.

## 5. Cookies

The website uses a small number of cookies that are needed for it to work: one that remembers your language and, for administrators only, a login session cookie. We do not use advertising or third-party tracking cookies.

## 6. How long we keep data

We keep data only as long as needed for the purposes above: bot and access data while you use our channels, and server logs for a limited time. When it is no longer needed, we delete it or make it anonymous.

## 7. Your rights

Depending on where you live, you may have the right to access, correct or delete your personal data, to object to or restrict its use, and to receive a copy of it. You can also complain to your local data protection authority.

To use any of these rights, or to ask us to delete your data, contact us at {email}. We may ask you to confirm your identity first.

## 8. Children

The Service is intended for adults aged 18 and over. We do not knowingly collect data from children. If you believe a child has given us personal data, contact us and we will delete it.

## 9. International transfers

Our service providers may process data in countries other than yours. When they do, we rely on their safeguards to protect your data.

## 10. Changes to this policy

We may update this Privacy Policy. The date at the top shows the latest version.

## 11. Contact

Questions about privacy or your data: {email}.`;

const TERMS_RU = `# Условия использования

Последнее обновление: {updated}

Настоящие Условия использования («Условия») регулируют использование сайта {company} по адресу {site}, нашего Telegram-бота и каналов, а также наших аккаунтов в социальных сетях (вместе — «Сервис»). Пользуясь Сервисом, вы соглашаетесь с этими Условиями. Если вы не согласны, пожалуйста, не используйте Сервис.

## 1. Что мы предоставляем

{company} публикует аналитику валютного рынка, новости и примеры торговых сигналов, подготовленные с помощью искусственного интеллекта. Сигнал обычно содержит валютную пару, направление, уровень входа, цели по прибыли и стоп-лосс, а также график.

Мы **не являемся брокером**, не совершаем сделки и никогда не храним, не получаем и не управляем вашими деньгами. Вся ваша торговля происходит на сторонних платформах, которые вы выбираете сами, по их собственным правилам.

## 2. Кто может пользоваться Сервисом

Вам должно быть не менее 18 лет, и законы вашей страны должны разрешать вам пользоваться торговой информацией и подобными сервисами. Вы сами отвечаете за то, чтобы использование Сервиса было законным там, где вы живёте.

## 3. Не финансовая рекомендация

Все материалы — сигналы, аналитика, новости, посты и сообщения — носят **исключительно информационный и образовательный характер**. Это не инвестиционная, финансовая, юридическая или налоговая консультация и не предложение купить или продать какой-либо финансовый инструмент. Мы не знаем вашего финансового положения, целей и опыта. Решения вы принимаете сами и сами за них отвечаете. Если вам нужна консультация, обратитесь к лицензированному специалисту.

## 4. Предупреждение о рисках

Торговля на рынке форекс и другими инструментами с кредитным плечом связана с **высоким риском** и подходит не всем:

- Вы можете потерять часть или все свои деньги, а с кредитным плечом убытки могут превысить депозит.
- Цены могут меняться очень быстро; ордера могут исполниться по худшей цене, чем ожидалось.
- Прошлые результаты, в том числе показанные нами, не гарантируют будущих.
- Торгуйте только теми деньгами, потерю которых можете себе позволить.

## 5. Отсутствие гарантий и ограничения ИИ

Наши сигналы и аналитика создаются автоматическими моделями и могут быть ошибочными, запоздалыми или неполными. Рыночные данные могут содержать ошибки или задержки. Мы не гарантируем прибыль, точность, процент прибыльных сделок или доступность Сервиса и можем в любой момент изменить или прекратить любой сигнал, канал или функцию.

## 6. Сторонние сервисы

Сервис использует сторонние платформы, такие как Telegram и TikTok, и может упоминать брокеров или торговые платформы. Их использование регулируется их собственными условиями и политиками конфиденциальности. Мы не отвечаем за их содержание, работу, действия или за аккаунты, которые вы у них открываете. Ссылка на сторонний сервис не означает, что мы его рекомендуем.

## 7. Доступ к нашим каналам

Для доступа к некоторым каналам может потребоваться выполнить шаги, которые описывает наш бот (например, зарегистрироваться по нашей партнёрской ссылке и отправить нам ID аккаунта). Мы можем предоставить, отклонить или отозвать доступ по своему усмотрению — например, если данные нельзя проверить или вы нарушаете эти Условия.

## 8. Правила использования

Вы обязуетесь не:

- перепродавать, публиковать или передавать наши закрытые сигналы и материалы каналов без нашего письменного разрешения;
- выдавать наши материалы за свои или удалять наш бренд;
- использовать Сервис для незаконных, мошеннических или вредных целей;
- рассылать спам, оскорблять других, выдавать себя за других, мешать работе Сервиса или пытаться получить к нему несанкционированный доступ.

Нашими **публичными** постами можно делиться со ссылкой на источник.

## 9. Интеллектуальная собственность

Название и логотип {company}, сайт, тексты, графики, изображения и видео принадлежат нам или нашим лицензиарам и охраняются законом. Кроме случаев, разрешённых этими Условиями, их нельзя копировать, изменять или распространять.

## 10. Ограничение ответственности

В максимальной степени, разрешённой законом, Сервис предоставляется «как есть» и «по мере доступности», без каких-либо гарантий. {company} и наша команда не несут ответственности за торговые убытки, упущенную прибыль и любой прямой, косвенный или последующий ущерб, связанный с использованием Сервиса или доверием к нему. Ничто в этих Условиях не ограничивает ответственность, которую нельзя ограничить по закону.

## 11. Приостановка и прекращение доступа

Мы можем в любой момент приостановить или прекратить ваш доступ к Сервису, включая каналы и бота, если вы нарушаете эти Условия или если мы прекращаем работу Сервиса.

## 12. Изменение Условий

Мы можем время от времени обновлять эти Условия. Дата вверху страницы показывает актуальную версию. Продолжая пользоваться Сервисом после изменений, вы принимаете обновлённые Условия.

## 13. Контакты

Вопросы по этим Условиям: {email}.`;

const PRIVACY_RU = `# Политика конфиденциальности

Последнее обновление: {updated}

Эта Политика конфиденциальности объясняет, какие персональные данные {company} («мы») собирает, когда вы пользуетесь нашим сайтом {site}, Telegram-ботом и каналами, а также аккаунтами в социальных сетях, зачем мы это делаем и какие у вас есть права.

## 1. Какие данные мы собираем

**Когда вы заходите на сайт**

- Выбранный язык — сохраняется в cookie, чтобы сайт его запомнил.
- Примерную страну, определённую по IP-адресу, — только чтобы показать сайт на нужном языке. Для этого мы не храним ваш IP-адрес.
- Стандартные технические журналы нашего сервера и хостинга (IP-адрес, тип браузера, запрошенные страницы, время) — для безопасности и работы сайта.

**Когда вы пользуетесь нашим Telegram-ботом**

- Ваш Telegram ID, имя пользователя, имя и язык.
- Информацию, которую вы отправляете боту, — например, ID аккаунта торговой платформы для доступа к каналу, и ваши сообщения нам.
- Статус вашей заявки на доступ (например, на проверке, одобрена или отклонена).

**Наши аккаунты в социальных сетях**

- Мы подключаем **свой собственный** аккаунт TikTok, чтобы публиковать наши посты. Для этого мы храним токены доступа, которые TikTok выдаёт для нашего аккаунта, и созданные нами посты. Через это подключение мы не собираем персональные данные людей, которые смотрят наши посты или взаимодействуют с ними.

Мы сознательно не собираем чувствительные данные и никогда не просим пароли, номера карт или доступ к вашему торговому счёту.

## 2. Зачем мы используем данные

- Чтобы показывать сайт на вашем языке и обеспечивать его безопасность и работу.
- Чтобы проверять и управлять доступом к нашим Telegram-каналам.
- Чтобы отвечать вам и оказывать поддержку.
- Чтобы публиковать наш собственный контент в каналах и социальных сетях.

Мы **не продаём** ваши персональные данные и не используем их для рекламных профилей.

## 3. Правовые основания

Там, где действуют законы о защите данных (например, GDPR), мы обрабатываем данные, потому что это необходимо для предоставления запрошенного вами Сервиса, в наших законных интересах (работа и безопасность Сервиса) или с вашего согласия, когда оно требуется.

## 4. Кому мы передаём данные

Мы передаём данные только поставщикам услуг, которые помогают нам работать, и только в необходимом объёме:

- **Telegram** — доставляет нашего бота и каналы.
- **TikTok** — платформа, где мы публикуем посты.
- **OpenAI** — помогает нам писать тексты и аналитику. Ваши персональные данные мы для этого не передаём.
- **Twelve Data** — поставщик рыночных данных. Ваших персональных данных он не получает.
- Наш **хостинг-провайдер** — хранит сайт и его данные.

Мы также можем раскрыть данные, если этого требует закон, или для защиты наших прав и пользователей.

## 5. Cookie

Сайт использует несколько необходимых cookie: одна запоминает ваш язык, а для администраторов — cookie входа в систему. Рекламные и сторонние отслеживающие cookie мы не используем.

## 6. Как долго мы храним данные

Мы храним данные только столько, сколько нужно для указанных целей: данные бота и доступа — пока вы пользуетесь нашими каналами, журналы сервера — ограниченное время. Когда данные больше не нужны, мы удаляем или обезличиваем их.

## 7. Ваши права

В зависимости от страны проживания вы можете иметь право получить доступ к своим данным, исправить или удалить их, возразить против их использования или ограничить его, а также получить их копию. Вы также можете подать жалобу в местный орган по защите данных.

Чтобы воспользоваться этими правами или попросить удалить ваши данные, напишите нам: {email}. Мы можем попросить подтвердить вашу личность.

## 8. Дети

Сервис предназначен для взрослых от 18 лет. Мы сознательно не собираем данные детей. Если вы считаете, что ребёнок передал нам персональные данные, свяжитесь с нами, и мы их удалим.

## 9. Передача данных в другие страны

Наши поставщики услуг могут обрабатывать данные в других странах. В этом случае мы полагаемся на их меры защиты данных.

## 10. Изменения политики

Мы можем обновлять эту Политику конфиденциальности. Дата вверху страницы показывает актуальную версию.

## 11. Контакты

Вопросы о конфиденциальности и ваших данных: {email}.`;

const TERMS_ES = `# Términos de servicio

Última actualización: {updated}

Estos Términos de servicio («Términos») regulan el uso del sitio web de {company} en {site}, de nuestro bot y canales de Telegram y de nuestras cuentas en redes sociales (en conjunto, el «Servicio»). Al usar el Servicio aceptas estos Términos. Si no estás de acuerdo, no uses el Servicio.

## 1. Qué ofrecemos

{company} publica análisis del mercado de divisas, noticias y señales de trading de ejemplo generadas con ayuda de inteligencia artificial. Una señal suele incluir un par de divisas, una dirección, un nivel de entrada, objetivos de beneficio y un stop loss, junto con un gráfico.

**No somos un bróker**, no ejecutamos operaciones y nunca guardamos, recibimos ni gestionamos tu dinero. Cualquier operación que hagas ocurre en plataformas de terceros que tú eliges, bajo sus propias condiciones.

## 2. Requisitos

Debes tener al menos 18 años y que las leyes de tu país te permitan usar información y servicios relacionados con el trading. Eres responsable de que tu uso del Servicio sea legal donde vives.

## 3. No es asesoramiento financiero

Todo el contenido —señales, análisis, noticias, publicaciones y mensajes— es **solo informativo y educativo**. No es asesoramiento de inversión, financiero, legal ni fiscal, ni una recomendación u oferta para comprar o vender ningún instrumento financiero. No conocemos tu situación financiera, tus objetivos ni tu experiencia. Tú tomas tus decisiones y eres el único responsable de ellas. Si necesitas asesoramiento, consulta a un profesional autorizado.

## 4. Advertencia de riesgo

Operar divisas (forex) y otros productos apalancados conlleva un **alto riesgo** y puede no ser adecuado para todos:

- Puedes perder parte o la totalidad de tu dinero y, con apalancamiento, las pérdidas pueden superar tu depósito.
- Los precios pueden moverse muy rápido; las órdenes pueden ejecutarse a precios peores de lo esperado.
- Los resultados pasados, incluidos los que mostramos, no garantizan resultados futuros.
- Opera solo con dinero que puedas permitirte perder.

## 5. Sin garantías y límites de la IA

Nuestras señales y análisis se generan con modelos automáticos y pueden ser incorrectos, tardíos o incompletos. Los datos de mercado pueden contener errores o retrasos. No garantizamos beneficios, exactitud, tasa de aciertos ni disponibilidad del Servicio, y podemos cambiar o suspender cualquier señal, canal o función en cualquier momento.

## 6. Servicios de terceros

El Servicio usa plataformas de terceros como Telegram y TikTok y puede mencionar brókers o plataformas de trading. Su uso se rige por sus propios términos y políticas de privacidad. No somos responsables de su contenido, disponibilidad, acciones ni de las cuentas que abras con ellos. Un enlace a un tercero no significa que lo respaldemos.

## 7. Acceso a nuestros canales

Para acceder a algunos canales puede ser necesario seguir los pasos que indica nuestro bot (por ejemplo, registrarte con nuestro enlace de socio y enviarnos el ID de tu cuenta). Podemos aprobar, rechazar o retirar el acceso a nuestra discreción, por ejemplo si los datos no se pueden verificar o si incumples estos Términos.

## 8. Uso aceptable

Te comprometes a no:

- revender, publicar o compartir nuestras señales privadas o el contenido de los canales sin nuestro permiso por escrito;
- presentar nuestro contenido como tuyo o quitar nuestra marca;
- usar el Servicio para fines ilegales, fraudulentos o dañinos;
- enviar spam, acosar o suplantar a otros, interferir en el Servicio o intentar acceder a él sin autorización.

Puedes compartir nuestras publicaciones **públicas** con un enlace a la fuente original.

## 9. Propiedad intelectual

El nombre y el logotipo de {company}, el sitio web, los textos, gráficos, imágenes y vídeos nos pertenecen a nosotros o a nuestros licenciantes y están protegidos por la ley. Salvo lo permitido en estos Términos, no puedes copiarlos, modificarlos ni distribuirlos.

## 10. Limitación de responsabilidad

En la máxima medida permitida por la ley, el Servicio se ofrece «tal cual» y «según disponibilidad», sin garantías de ningún tipo. {company} y su equipo no son responsables de pérdidas de trading, lucro cesante ni de ningún daño directo, indirecto o consecuente derivado del uso del Servicio o de la confianza en él. Nada en estos Términos limita la responsabilidad que la ley no permite limitar.

## 11. Suspensión y terminación

Podemos suspender o finalizar tu acceso al Servicio, incluidos los canales y el bot, en cualquier momento si incumples estos Términos o si dejamos de ofrecer el Servicio.

## 12. Cambios en estos Términos

Podemos actualizar estos Términos ocasionalmente. La fecha de arriba indica la versión vigente. Si sigues usando el Servicio después de un cambio, aceptas los Términos actualizados.

## 13. Contacto

Preguntas sobre estos Términos: {email}.`;

const PRIVACY_ES = `# Política de privacidad

Última actualización: {updated}

Esta Política de privacidad explica qué datos personales recopila {company} («nosotros») cuando usas nuestro sitio web {site}, nuestro bot y canales de Telegram y nuestras cuentas en redes sociales, por qué los recopilamos y qué derechos tienes.

## 1. Datos que recopilamos

**Cuando visitas el sitio web**

- El idioma que eliges, guardado en una cookie para que el sitio lo recuerde.
- Tu país aproximado, deducido de tu dirección IP, solo para mostrar el sitio en el idioma correcto. Para esto no guardamos tu IP.
- Registros técnicos estándar de nuestro servidor y hosting (dirección IP, tipo de navegador, páginas solicitadas, hora), para la seguridad y el funcionamiento del sitio.

**Cuando usas nuestro bot de Telegram**

- Tu ID de Telegram, nombre de usuario, nombre e idioma.
- La información que envías al bot, como el ID de tu cuenta de la plataforma de trading para solicitar acceso a nuestro canal, y tus mensajes.
- El estado de tu solicitud de acceso (por ejemplo, pendiente, aprobada o rechazada).

**Nuestras cuentas en redes sociales**

- Conectamos nuestra **propia** cuenta de TikTok para publicar nuestros posts. Para ello guardamos los tokens de acceso que TikTok nos da para nuestra cuenta y las publicaciones que creamos. A través de esta conexión no recopilamos datos personales de quienes ven o interactúan con nuestras publicaciones.

No recopilamos a sabiendas datos sensibles y nunca pedimos contraseñas, números de tarjeta ni acceso a tu cuenta de trading.

## 2. Para qué usamos tus datos

- Para mostrar el sitio en tu idioma y mantenerlo seguro y funcionando.
- Para verificar y gestionar el acceso a nuestros canales de Telegram.
- Para responderte y darte soporte.
- Para publicar nuestro propio contenido en nuestros canales y redes sociales.

**No vendemos** tus datos personales ni los usamos para perfiles publicitarios.

## 3. Base legal

Cuando se aplican leyes de protección de datos como el RGPD, tratamos los datos porque es necesario para prestar el Servicio que solicitas, por nuestros intereses legítimos (operar y proteger el Servicio) o con tu consentimiento cuando sea necesario.

## 4. Con quién compartimos datos

Solo compartimos datos con proveedores que nos ayudan a prestar el Servicio, y solo en lo necesario:

- **Telegram**, que ofrece nuestro bot y canales.
- **TikTok**, donde publicamos nuestros posts.
- **OpenAI**, que nos ayuda a redactar contenido y análisis. No le enviamos tus datos personales para ello.
- **Twelve Data**, nuestro proveedor de datos de mercado. No recibe datos personales tuyos.
- Nuestro proveedor de **hosting**, que almacena el sitio y sus datos.

También podemos revelar datos si la ley lo exige o para proteger nuestros derechos y a los usuarios.

## 5. Cookies

El sitio usa pocas cookies, todas necesarias: una recuerda tu idioma y, solo para administradores, una cookie de sesión. No usamos cookies publicitarias ni de seguimiento de terceros.

## 6. Cuánto tiempo guardamos los datos

Guardamos los datos solo el tiempo necesario para los fines indicados: los datos del bot y del acceso mientras uses nuestros canales, y los registros del servidor durante un tiempo limitado. Cuando ya no son necesarios, los eliminamos o anonimizamos.

## 7. Tus derechos

Según dónde vivas, puedes tener derecho a acceder a tus datos, corregirlos o eliminarlos, oponerte a su uso o limitarlo y recibir una copia. También puedes reclamar ante la autoridad de protección de datos de tu país.

Para ejercer estos derechos o pedirnos que eliminemos tus datos, escríbenos a {email}. Es posible que te pidamos confirmar tu identidad.

## 8. Menores

El Servicio está dirigido a adultos mayores de 18 años. No recopilamos a sabiendas datos de menores. Si crees que un menor nos ha dado datos personales, contáctanos y los eliminaremos.

## 9. Transferencias internacionales

Nuestros proveedores pueden tratar datos en países distintos al tuyo. En ese caso, confiamos en sus garantías para proteger tus datos.

## 10. Cambios en esta política

Podemos actualizar esta Política de privacidad. La fecha de arriba indica la versión vigente.

## 11. Contacto

Preguntas sobre privacidad o tus datos: {email}.`;

export const LEGAL_DEFAULTS = {
  termsEn: TERMS_EN,
  termsRu: TERMS_RU,
  termsEs: TERMS_ES,
  privacyEn: PRIVACY_EN,
  privacyRu: PRIVACY_RU,
  privacyEs: PRIVACY_ES,
};
