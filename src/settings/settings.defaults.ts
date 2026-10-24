import { AppSettings } from './settings.types';

export const DEFAULT_SYSTEM_PROMPT = `You are a senior institutional forex analyst working for MultiAITrading.
You receive recent OHLC candles and a technical indicator snapshot for one currency pair.
Decide whether there is a high-probability trade RIGHT NOW.

Rules:
- Only return BUY or SELL when trend, momentum and price structure agree. Otherwise return NONE.
- Respect support/resistance visible in the candles; never place entry directly into a strong level.
- Stop loss must sit beyond the nearest swing high/low and be at least 1x ATR from entry.
- Take profit 1 must give at least 1:1 risk-reward, take profit 2 at least 1:2.
- Confidence is 0-100 and must be honest: 70+ only for clean, confluent setups.
- Reasoning: 2-3 short sentences a trader can read in a Telegram message. No disclaimers.`;

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    botEnabled: false,
    mode: 'AI',
    timeframe: '15min',
    scanIntervalMinutes: 15,
    maxSignalsPerDay: 10,
    pairCooldownMinutes: 240,
    onePerPairWhileOpen: true,
    sessions: ['london', 'newyork'],
    skipWeekends: true,
    signalLanguage: 'en',
  },
  ai: {
    apiKey: '',
    model: 'gpt-5',
    temperature: 0.2,
    candlesCount: 120,
    minConfidence: 70,
    useHigherTimeframe: true,
    levelsSource: 'ai',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
  custom: {
    candlesCount: 200,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    emaFast: 21,
    emaSlow: 50,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    requiredConfirmations: 2,
    minConfidence: 65,
  },
  risk: {
    atrPeriod: 14,
    slAtrMultiplier: 1.5,
    tp1RiskReward: 1,
    tp2RiskReward: 2,
    expiryHours: 24,
    breakevenAfterTp1: true,
  },
  telegram: {
    botToken: '',
    channelId: '',
    showReasoning: true,
    showConfidence: true,
    sendChart: true,
    postResults: true,
  },
  marketData: {
    apiKey: '',
    requestsPerMinute: 8,
  },
  landing: {
    signalsChannelUrl: '',
    supportUrl: '',
    showStats: true,
    showRecentResults: true,
  },
  bot: {
    welcomeEnabled: true,
    welcomeEn: `👋 <b>Welcome to MultiAI Trading!</b>

Our AI analyses 17 currency pairs around the clock and finds the best entry points.

📈 Over time you will start receiving trading signals: entry, take profit, stop loss and a real market chart.

To get access to the private signals channel, message our support 👇`,
    welcomeRu: `👋 <b>Добро пожаловать в MultiAI Trading!</b>

Наш искусственный интеллект круглосуточно анализирует 17 валютных пар и находит лучшие точки входа.

📈 Со временем вы будете получать торговые сигналы: вход, тейк-профит, стоп-лосс и реальный график рынка.

Чтобы получить доступ к приватному каналу сигналов, напишите в поддержку 👇`,
    welcomeEs: `👋 <b>¡Bienvenido a MultiAI Trading!</b>

Nuestra IA analiza 17 pares de divisas sin descanso y encuentra los mejores puntos de entrada.

📈 Con el tiempo empezarás a recibir señales de trading: entrada, take profit, stop loss y un gráfico real del mercado.

Para acceder al canal privado de señales, escribe a nuestro soporte 👇`,
    showChannelButton: true,
    showSupportButton: true,
  },
  access: {
    enabled: false,
    referralUrl: '',
    adminTelegramIds: '',
    joinLink: '',
    stepsEn: `🔐 <b>How to get access to the signals channel</b>

1️⃣ Register on Pocket Option using the button below (our partner link).
2️⃣ Copy your account ID — Profile → the number under your name.
3️⃣ Press <b>"I registered"</b> and send us the ID.

We check it and send you the channel link. Accounts registered without our link can't be approved.`,
    stepsRu: `🔐 <b>Как получить доступ к каналу сигналов</b>

1️⃣ Зарегистрируйтесь на Pocket Option по кнопке ниже (наша партнёрская ссылка).
2️⃣ Скопируйте ID аккаунта — Профиль → номер под вашим именем.
3️⃣ Нажмите <b>«Я зарегистрировался»</b> и отправьте нам ID.

Мы проверим его и пришлём ссылку на канал. Аккаунты, зарегистрированные не по нашей ссылке, не могут быть одобрены.`,
    stepsEs: `🔐 <b>Cómo acceder al canal de señales</b>

1️⃣ Regístrate en Pocket Option con el botón de abajo (nuestro enlace de socio).
2️⃣ Copia tu ID de cuenta — Perfil → el número bajo tu nombre.
3️⃣ Pulsa <b>"Ya me registré"</b> y envíanos el ID.

Lo verificamos y te enviamos el enlace del canal. Las cuentas registradas sin nuestro enlace no pueden ser aprobadas.`,
  },
};
