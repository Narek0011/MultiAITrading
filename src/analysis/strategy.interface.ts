import { Candle, TradeIdea } from '../common/types';
import { Lang, Timeframe } from '../settings/settings.types';
import { IndicatorSeries } from './indicators';

export interface AnalysisInput {
  pair: string;
  timeframe: Timeframe;
  language: Lang;
  candles: Candle[];
  indicators: IndicatorSeries;
  higherTimeframe?: { timeframe: Timeframe; candles: Candle[] };
}

export interface Strategy {
  analyze(input: AnalysisInput): Promise<TradeIdea>;
}
