import { Candle, TradeIdea } from '../common/types';
import { SignalLang, Timeframe } from '../settings/settings.types';
import { IndicatorSeries } from './indicators';

export interface AnalysisInput {
  pair: string;
  timeframe: Timeframe;
  language: SignalLang;
  candles: Candle[];
  indicators: IndicatorSeries;
  higherTimeframe?: { timeframe: Timeframe; candles: Candle[] };
  /** Set for expiration-style signals: the direction must hold for this many minutes. */
  expiryMinutes?: number;
}

export interface Strategy {
  analyze(input: AnalysisInput): Promise<TradeIdea>;
}
