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
}

export type SettingsGroup = keyof AppSettings;

export const SETTINGS_GROUPS: SettingsGroup[] = ['general', 'ai', 'custom', 'risk', 'telegram', 'marketData', 'landing', 'bot', 'access'];

/** Fields that are never sent back to the browser in full. */
export const SECRET_FIELDS: Partial<Record<SettingsGroup, string[]>> = {
  ai: ['apiKey'],
  telegram: ['botToken'],
  marketData: ['apiKey'],
};
