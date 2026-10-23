import { Injectable } from '@nestjs/common';
import { HIGHER_TIMEFRAME } from '../common/forex';
import { Candle, TradeIdea } from '../common/types';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { StrategyMode } from '../settings/settings.types';
import { AiStrategy } from './ai.strategy';
import { IndicatorStrategy } from './indicator.strategy';
import { computeIndicators, IndicatorSeries } from './indicators';

export interface AnalysisResult {
  pair: string;
  mode: StrategyMode;
  candles: Candle[];
  indicators: IndicatorSeries;
  idea: TradeIdea;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly settings: SettingsService,
    private readonly market: TwelveDataService,
    private readonly ai: AiStrategy,
    private readonly custom: IndicatorStrategy,
  ) {}

  async analyze(pair: string, mode = this.settings.get('general').mode): Promise<AnalysisResult> {
    const general = this.settings.get('general');
    const ai = this.settings.get('ai');
    const custom = this.settings.get('custom');
    const risk = this.settings.get('risk');

    // Always fetch enough history for the slowest indicator to warm up.
    const warmup = Math.max(custom.emaSlow, custom.macdSlow + custom.macdSignal) + 20;
    const size = Math.min(5000, Math.max(warmup, mode === 'AI' ? ai.candlesCount : custom.candlesCount));
    const candles = await this.market.getCandles(pair, general.timeframe, size);
    if (candles.length < warmup) throw new Error(`${pair}: only ${candles.length} candles returned`);

    const indicators = computeIndicators(candles, { ...custom, atrPeriod: risk.atrPeriod });
    const input = { pair, timeframe: general.timeframe, language: general.signalLanguage, candles, indicators };

    let idea: TradeIdea;
    if (mode === 'AI') {
      const htf = HIGHER_TIMEFRAME[general.timeframe];
      const higherTimeframe =
        ai.useHigherTimeframe && htf !== general.timeframe
          ? { timeframe: htf, candles: await this.market.getCandles(pair, htf, 60) }
          : undefined;
      idea = await this.ai.analyze({ ...input, higherTimeframe });
    } else {
      idea = await this.custom.analyze(input);
    }
    return { pair, mode, candles, indicators, idea };
  }

  minConfidence(mode: StrategyMode) {
    return mode === 'AI' ? this.settings.get('ai').minConfidence : this.settings.get('custom').minConfidence;
  }
}
