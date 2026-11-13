import { Injectable } from '@nestjs/common';
import { HIGHER_TIMEFRAME } from '../common/forex';
import { Candle, TradeIdea } from '../common/types';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { StrategyMode, Timeframe } from '../settings/settings.types';
import { AiStrategy } from './ai.strategy';
import { closedCandles, expirySetup } from './expiry.strategy';
import { IndicatorStrategy } from './indicator.strategy';
import { computeIndicators, IndicatorSeries } from './indicators';

export interface AnalysisResult {
  pair: string;
  mode: StrategyMode;
  /** Timeframe the decision was made on. */
  timeframe: Timeframe;
  candles: Candle[];
  indicators: IndicatorSeries;
  idea: TradeIdea;
  /** Latest quote seen while fetching (the forming candle's close) and when — a fresh entry price without another request. */
  quote?: { price: number; at: number };
}

/** 1-min history for the expiry setup: enough complete 15-min candles for the slow trend EMA to warm up. */
const EXPIRY_M1_CANDLES = 1500;
/** Candles drawn on the stored chart of an expiry signal. */
const EXPIRY_CHART_CANDLES = 120;

@Injectable()
export class AnalysisService {
  constructor(
    private readonly settings: SettingsService,
    private readonly market: TwelveDataService,
    private readonly ai: AiStrategy,
    private readonly custom: IndicatorStrategy,
  ) {}

  async analyze(pair: string, mode = this.settings.get('general').mode, opts: { priority?: boolean } = {}): Promise<AnalysisResult> {
    const general = this.settings.get('general');
    if (mode === 'CUSTOM' && general.signalStyle === 'expiry') return this.analyzeExpiry(pair, opts.priority);
    const ai = this.settings.get('ai');
    const custom = this.settings.get('custom');
    const risk = this.settings.get('risk');

    // Always fetch enough history for the slowest indicator to warm up.
    const warmup = Math.max(custom.emaSlow, custom.macdSlow + custom.macdSignal) + 20;
    const size = Math.min(5000, Math.max(warmup, mode === 'AI' ? ai.candlesCount : custom.candlesCount));
    const candles = await this.market.getCandles(pair, general.timeframe, size);
    if (candles.length < warmup) throw new Error(`${pair}: only ${candles.length} candles returned`);

    const indicators = computeIndicators(candles, { ...custom, atrPeriod: risk.atrPeriod });
    const input = {
      pair,
      timeframe: general.timeframe,
      language: general.signalLanguage,
      candles,
      indicators,
      expiryMinutes: general.signalStyle === 'expiry' ? Math.max(1, Math.round(general.expiryMinutes)) : undefined,
    };

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
    return { pair, mode, timeframe: general.timeframe, candles, indicators, idea };
  }

  /** Custom mode, expiry style: the trend-pullback setup on closed 1-min candles (see expiry.strategy.ts). */
  private async analyzeExpiry(pair: string, priority = false): Promise<AnalysisResult> {
    const custom = this.settings.get('custom');
    const risk = this.settings.get('risk');
    const all = await this.market.getCandles(pair, '1min', EXPIRY_M1_CANDLES, { priority });
    const fetchedAt = Date.now();
    const candles = closedCandles(all, 60_000, fetchedAt);
    if (candles.length < 900) throw new Error(`${pair}: only ${candles.length} 1-min candles returned`);
    const setup = expirySetup(pair, candles, {
      trendFast: custom.emaFast,
      trendSlow: custom.emaSlow,
      rsiPeriod: custom.expiryRsiPeriod,
      pullbackRsi: custom.expiryPullbackRsi,
      lookback: 5,
      atrPeriod: risk.atrPeriod,
      minAtrPips: custom.expiryMinAtrPips,
      maxAtrPips: custom.expiryMaxAtrPips,
    });
    const entry = candles[candles.length - 1].close;
    const latest = all[all.length - 1];
    const chart = candles.slice(-(EXPIRY_CHART_CANDLES + 100));
    const full = computeIndicators(chart, { ...custom, atrPeriod: risk.atrPeriod });
    const tail = <T>(a: T[]) => a.slice(-EXPIRY_CHART_CANDLES);
    return {
      pair,
      mode: 'CUSTOM',
      timeframe: '1min',
      candles: tail(chart),
      indicators: { emaFast: tail(full.emaFast), emaSlow: tail(full.emaSlow), rsi: tail(full.rsi), macdHist: tail(full.macdHist), atr: tail(full.atr) },
      idea: {
        direction: setup.direction,
        confidence: setup.confidence,
        entry,
        stopLoss: entry,
        takeProfit1: entry,
        takeProfit2: entry,
        reasoning: setup.reasons.join(', ') + '.',
      },
      // Only a candle opened within the last minute is a live quote.
      quote: latest && fetchedAt - latest.time < 60_000 ? { price: latest.close, at: fetchedAt } : undefined,
    };
  }

  minConfidence(mode: StrategyMode) {
    return mode === 'AI' ? this.settings.get('ai').minConfidence : this.settings.get('custom').minConfidence;
  }
}
