import { Injectable } from '@nestjs/common';
import { TradeIdea } from '../common/types';
import { SettingsService } from '../settings/settings.service';
import { CustomStrategySettings } from '../settings/settings.types';
import { IndicatorSeries, last } from './indicators';
import { atrLevels } from './levels';
import { AnalysisInput, Strategy } from './strategy.interface';

interface Vote {
  bull: string[];
  bear: string[];
  freshBull: boolean;
  freshBear: boolean;
}

/**
 * Rule-based confluence strategy. Each indicator votes bullish or bearish; a signal needs
 * `requiredConfirmations` votes on one side and at least one *fresh* trigger (a cross that
 * happened on the last two candles) so the same trend is not signalled on every scan.
 */
export function voteIndicators(s: IndicatorSeries, cfg: CustomStrategySettings): Vote {
  const v: Vote = { bull: [], bear: [], freshBull: false, freshBear: false };
  const fast = last(s.emaFast), slow = last(s.emaSlow);
  const fastPrev = last(s.emaFast, 2), slowPrev = last(s.emaSlow, 2);
  const rsi = last(s.rsi), rsiPrev = last(s.rsi, 1), rsiPrev2 = last(s.rsi, 2);
  const hist = last(s.macdHist), histPrev = last(s.macdHist, 1), histPrev2 = last(s.macdHist, 2);

  if (fast != null && slow != null) {
    if (fast > slow) v.bull.push(`EMA${cfg.emaFast} above EMA${cfg.emaSlow}`);
    if (fast < slow) v.bear.push(`EMA${cfg.emaFast} below EMA${cfg.emaSlow}`);
    if (fastPrev != null && slowPrev != null) {
      if (fastPrev <= slowPrev && fast > slow) v.freshBull = true;
      if (fastPrev >= slowPrev && fast < slow) v.freshBear = true;
    }
  }

  if (hist != null && histPrev != null) {
    if (hist > 0 && hist > histPrev) v.bull.push('MACD momentum rising');
    if (hist < 0 && hist < histPrev) v.bear.push('MACD momentum falling');
    const crossedUp = (histPrev <= 0 && hist > 0) || (histPrev2 != null && histPrev2 <= 0 && histPrev > 0 && hist > 0);
    const crossedDown = (histPrev >= 0 && hist < 0) || (histPrev2 != null && histPrev2 >= 0 && histPrev < 0 && hist < 0);
    if (crossedUp) v.freshBull = true;
    if (crossedDown) v.freshBear = true;
  }

  if (rsi != null && rsiPrev != null) {
    if (rsi > 50 && rsi < cfg.rsiOverbought && rsi > rsiPrev) v.bull.push(`RSI ${rsi.toFixed(0)} rising`);
    if (rsi < 50 && rsi > cfg.rsiOversold && rsi < rsiPrev) v.bear.push(`RSI ${rsi.toFixed(0)} falling`);
    const recoveredUp = [rsiPrev, rsiPrev2].some((p) => p != null && p < cfg.rsiOversold) && rsi >= cfg.rsiOversold;
    const recoveredDown = [rsiPrev, rsiPrev2].some((p) => p != null && p > cfg.rsiOverbought) && rsi <= cfg.rsiOverbought;
    if (recoveredUp) { v.freshBull = true; v.bull.push('RSI recovered from oversold'); }
    if (recoveredDown) { v.freshBear = true; v.bear.push('RSI dropped from overbought'); }
    // Never buy into overbought or sell into oversold.
    if (rsi >= cfg.rsiOverbought) v.bull.length = 0;
    if (rsi <= cfg.rsiOversold) v.bear.length = 0;
  }
  return v;
}

@Injectable()
export class IndicatorStrategy implements Strategy {
  constructor(private readonly settings: SettingsService) {}

  async analyze(input: AnalysisInput): Promise<TradeIdea> {
    const cfg = this.settings.get('custom');
    const risk = this.settings.get('risk');
    const { candles, indicators, pair } = input;
    const entry = candles[candles.length - 1].close;
    const atr = last(indicators.atr);
    const vote = voteIndicators(indicators, cfg);

    const bullOk = vote.bull.length >= cfg.requiredConfirmations && vote.freshBull;
    const bearOk = vote.bear.length >= cfg.requiredConfirmations && vote.freshBear;

    if (atr == null || bullOk === bearOk) {
      const reasons = [...vote.bull, ...vote.bear];
      return {
        direction: 'NONE',
        confidence: 0,
        entry,
        stopLoss: entry,
        takeProfit1: entry,
        takeProfit2: entry,
        reasoning: reasons.length ? `No clean confluence: ${reasons.join(', ')}.` : 'No setup on the latest candles.',
      };
    }

    const direction = bullOk ? 'BUY' : 'SELL';
    const reasons = bullOk ? vote.bull : vote.bear;
    const confidence = Math.min(92, 50 + reasons.length * 12 + 5);
    return {
      direction,
      confidence,
      ...atrLevels(pair, direction, entry, atr, risk),
      reasoning: `${reasons.join(', ')}. Stop placed ${risk.slAtrMultiplier}× ATR from entry.`,
    };
  }
}
