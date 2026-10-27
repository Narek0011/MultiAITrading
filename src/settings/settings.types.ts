export type StrategyMode = 'AI' | 'CUSTOM';
export type Lang = 'en' | 'ru' | 'es';
export type Timeframe = '5min' | '15min' | '30min' | '1h' | '4h';
export type Session = 'sydney' | 'tokyo' | 'london' | 'newyork';

export interface GeneralSettings {
  botEnabled: boolean;
  mode: StrategyMode;
  timeframe: Timeframe;
  scanIntervalMinutes: number;
  maxSignalsPerDay: number;
  pairCooldownMinutes: number;
  onePerPairWhileOpen: boolean;
  sessions: Session[];
  skipWeekends: boolean;
  signalLanguage: Lang;
}

export interface AiSettings {
  apiKey: string;
  model: string;
  temperature: number;
  candlesCount: number;
  minConfidence: number;
  useHigherTimeframe: boolean;
  levelsSource: 'ai' | 'atr';
  systemPrompt: string;
}

export interface CustomStrategySettings {
  candlesCount: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  emaFast: number;
  emaSlow: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  requiredConfirmations: number;
  minConfidence: number;
}

export interface RiskSettings {
  atrPeriod: number;
  slAtrMultiplier: number;
  tp1RiskReward: number;
  tp2RiskReward: number;
  expiryHours: number;
  breakevenAfterTp1: boolean;
}

export interface TelegramSettings {
  botToken: string;
  channelId: string;
  showReasoning: boolean;
  showConfidence: boolean;
  sendChart: boolean;
  postResults: boolean;
}

export interface MarketDataSettings {
  apiKey: string;
  requestsPerMinute: number;
}

export interface LandingSettings {
  signalsChannelUrl: string;
  supportUrl: string;
  showStats: boolean;
  showRecentResults: boolean;
}

export interface BotSettings {
  welcomeEnabled: boolean;
  welcomeEn: string;
  welcomeRu: string;
  welcomeEs: string;
  showChannelButton: boolean;
  showSupportButton: boolean;
}

export interface AccessSettings {
  enabled: boolean;
  referralUrl: string;
  /** Telegram user ids (comma separated) that get approve/reject requests in the bot. */
  adminTelegramIds: string;
  /** Join-request invite link of the private channel, generated from the admin panel. */
  joinLink: string;
  stepsEn: string;
  stepsRu: string;
  stepsEs: string;
}

export type NewsSourceMode = 'ai' | 'custom' | 'both';

/** One Telegram channel the news can be posted to. The signals bot must be an admin there. */
export interface NewsChannel {
  /** Short stable id used in schedule slots and post rows (e.g. "main"). */
  key: string;
  name: string;
  /** @name or -100… id. */
  chatId: string;
  /** Public link, e.g. https://t.me/multi_ai_news (used on the website). */
  url: string;
  /** Posts are translated into this language for the channel. */
  language: Lang;
  enabled: boolean;
}

export interface NewsSettings {
  enabled: boolean;
  /** Channels posts go to. Empty = the legacy single channel below (channelId + language). */
  channels: NewsChannel[];
  /** Legacy single channel, e.g. @multi_ai_news — used only while `channels` is empty. */
  channelId: string;
  /** Legacy public link — used only while `channels` is empty. */
  channelUrl: string;
  /** Key of the channel whose link is shown on the website; empty = the first one with a link. */
  websiteChannel: string;
  language: Lang;
  sourceMode: NewsSourceMode;
  /** Custom news sources: one URL per line (RSS/Atom, JSON or a web page). */
  sources: string;
  /** Daily schedule, "HH:MM|type[|format[|channelKey,…]]". Format defaults to auto, channels to all enabled. */
  slots: string[];
  /** IANA timezone the slot times are in, e.g. Europe/Moscow. */
  timezone: string;
  skipWeekends: boolean;
  withChart: boolean;
  /** Extra instructions appended to the writing prompt. */
  instructions: string;
  /** OpenAI key for news posts; empty = use the key from AI settings. */
  apiKey: string;
  /** Model for news posts — separate from the signal model so they don't share one rate limit. */
  model: string;
}

/** TikTok developer app + the connected account (tokens are filled by the Connect flow). */
export interface TikTokSettings {
  clientKey: string;
  clientSecret: string;
  /** Default language for AI posts. */
  language: Lang;
  accessToken: string;
  refreshToken: string;
  /** ms since epoch */
  tokenExpiresAt: number;
  refreshExpiresAt: number;
  openId: string;
  displayName: string;
  avatarUrl: string;
}

/** Terms of Service and Privacy Policy, editable in Admin → Legal pages. Texts use a simple format (see legal-format.ts). */
export interface LegalSettings {
  companyName: string;
  /** Shown for {email}; empty = the support link from Landing settings. */
  contactEmail: string;
  /** YYYY-MM-DD, shown in the page's language. */
  updated: string;
  termsEn: string;
  termsRu: string;
  termsEs: string;
  privacyEn: string;
  privacyRu: string;
  privacyEs: string;
}

export interface AppSettings {
  general: GeneralSettings;
  ai: AiSettings;
  custom: CustomStrategySettings;
  risk: RiskSettings;
  telegram: TelegramSettings;
  marketData: MarketDataSettings;
  landing: LandingSettings;
  bot: BotSettings;
  access: AccessSettings;
  news: NewsSettings;
  tiktok: TikTokSettings;
  legal: LegalSettings;
}

export type SettingsGroup = keyof AppSettings;

export const SETTINGS_GROUPS: SettingsGroup[] = ['general', 'ai', 'custom', 'risk', 'telegram', 'marketData', 'landing', 'bot', 'access', 'news', 'tiktok', 'legal'];

/** Fields that are never sent back to the browser in full. */
export const SECRET_FIELDS: Partial<Record<SettingsGroup, string[]>> = {
  ai: ['apiKey'],
  telegram: ['botToken'],
  marketData: ['apiKey'],
  news: ['apiKey'],
  tiktok: ['clientSecret', 'accessToken', 'refreshToken'],
};
