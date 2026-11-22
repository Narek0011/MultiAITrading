import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Candle, TradeIdea } from '../common/types';
import { formatPrice, TIMEFRAME_LABEL } from '../common/forex';
import { SettingsService } from '../settings/settings.service';
import { indicatorSnapshot, last } from './indicators';
import { atrLevels, levelsAreValid } from './levels';
import { AnalysisInput, Strategy } from './strategy.interface';

const LANGUAGE_NAME = { en: 'English', ru: 'Russian', es: 'Spanish', hy: 'Armenian' } as const;

const TRADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['direction', 'confidence', 'entry', 'stopLoss', 'takeProfit1', 'takeProfit2', 'reasoning'],
  properties: {
    direction: { type: 'string', enum: ['BUY', 'SELL', 'NONE'] },
    confidence: { type: 'number', description: '0-100' },
    entry: { type: 'number' },
    stopLoss: { type: 'number' },
    takeProfit1: { type: 'number' },
    takeProfit2: { type: 'number' },
    reasoning: { type: 'string' },
  },
};

@Injectable()
export class AiStrategy implements Strategy {
  private readonly logger = new Logger(AiStrategy.name);

  constructor(private readonly settings: SettingsService) {}

  client() {
    const { anthropicApiKey } = this.settings.get('ai');
    if (!anthropicApiKey) throw new Error('Anthropic API key is not set (Admin → AI settings)');
    return new Anthropic({ apiKey: anthropicApiKey, timeout: 90_000 });
  }

  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const m of this.client().models.list()) ids.push(m.id);
    return ids.filter((id) => id.startsWith('claude-'));
  }

  async analyze(input: AnalysisInput): Promise<TradeIdea> {
    const cfg = this.settings.get('ai');
    const risk = this.settings.get('risk');
    const { pair, candles, indicators } = input;
    const atr = last(indicators.atr);

    const prompt = this.buildPrompt(input);
    const raw = await this.complete(cfg.model, cfg.systemPrompt, prompt);
    if (raw == null) return { direction: 'NONE', confidence: 0, entry: 0, stopLoss: 0, takeProfit1: 0, takeProfit2: 0, reasoning: 'Claude returned no decision.' };
    const idea = JSON.parse(raw) as TradeIdea;
    idea.confidence = Math.max(0, Math.min(100, Math.round(idea.confidence)));
    if (idea.direction === 'NONE') return idea;

    // Entry is always the live close; the AI only decides the direction and targets.
    const entry = candles[candles.length - 1].close;
    const aiLevels = { ...idea, entry };
    if (cfg.levelsSource === 'ai' && levelsAreValid(idea.direction, aiLevels)) return aiLevels;
    if (atr == null) return { ...idea, direction: 'NONE', reasoning: 'Not enough data for ATR levels.' };
    return { ...idea, ...atrLevels(pair, idea.direction, entry, atr, risk) };
  }

  private buildPrompt({ pair, timeframe, language, candles, indicators, higherTimeframe, expiryMinutes }: AnalysisInput) {
    const fmt = (c: Candle) =>
      [new Date(c.time).toISOString().slice(0, 16), formatPrice(pair, c.open), formatPrice(pair, c.high), formatPrice(pair, c.low), formatPrice(pair, c.close)].join(',');
    const count = this.settings.get('ai').candlesCount;
    const parts = [
      `Pair: ${pair}`,
      `Timeframe: ${TIMEFRAME_LABEL[timeframe]}`,
      `Now (UTC): ${new Date().toISOString()}`,
      `Indicator snapshot: ${JSON.stringify(indicatorSnapshot(candles, indicators))}`,
      `Candles (time,open,high,low,close), oldest first:\n${candles.slice(-count).map(fmt).join('\n')}`,
    ];
    if (higherTimeframe?.candles.length) {
      parts.push(
        `Higher timeframe ${TIMEFRAME_LABEL[higherTimeframe.timeframe]} candles for trend context:\n${higherTimeframe.candles.slice(-60).map(fmt).join('\n')}`,
      );
    }
    if (expiryMinutes) {
      parts.push(
        `This is a fixed-expiration trade: BUY wins if price is above the current price exactly ${expiryMinutes} minute(s) from now, SELL wins if it is below. ` +
          `Choose the direction for that horizon and set confidence to how likely it is to hold; answer NONE if the next ${expiryMinutes} minute(s) look like noise. Still fill the price levels.`,
      );
    }
    parts.push(`Write "reasoning" in ${LANGUAGE_NAME[language]}. Prices must use ${pair.endsWith('JPY') ? 3 : 5} decimals.`);
    return parts.join('\n\n');
  }

  /** One Claude request with a strict JSON schema. Returns null when Claude declined or was cut off. */
  private async complete(model: string, system: string, input: string): Promise<string | null> {
    const res = await this.client().beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: input }],
      output_config: { format: { type: 'json_schema', schema: TRADE_SCHEMA } },
      // If a safety classifier declines, the API retries on a fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      this.logger.warn(`${model} stopped with ${res.stop_reason}, no decision`);
      return null;
    }
    const text = res.content.find((b) => b.type === 'text');
    return text?.type === 'text' ? text.text : null;
  }
}
