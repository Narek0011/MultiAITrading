import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Candle, TradeIdea } from '../common/types';
import { formatPrice, TIMEFRAME_LABEL } from '../common/forex';
import { SettingsService } from '../settings/settings.service';
import { indicatorSnapshot, last } from './indicators';
import { atrLevels, levelsAreValid } from './levels';
import { AnalysisInput, Strategy } from './strategy.interface';

const LANGUAGE_NAME = { en: 'English', ru: 'Russian', es: 'Spanish' } as const;

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
    const { apiKey } = this.settings.get('ai');
    if (!apiKey) throw new Error('OpenAI API key is not set (Admin → AI settings)');
    return new OpenAI({ apiKey, timeout: 90_000 });
  }

  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const m of this.client().models.list()) ids.push(m.id);
    return ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id)).sort().reverse();
  }

  async analyze(input: AnalysisInput): Promise<TradeIdea> {
    const cfg = this.settings.get('ai');
    const risk = this.settings.get('risk');
    const { pair, candles, indicators } = input;
    const atr = last(indicators.atr);

    const prompt = this.buildPrompt(input);
    const raw = await this.complete(cfg.model, cfg.systemPrompt, prompt, cfg.temperature);
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

  private buildPrompt({ pair, timeframe, language, candles, indicators, higherTimeframe }: AnalysisInput) {
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
    parts.push(`Write "reasoning" in ${LANGUAGE_NAME[language]}. Prices must use ${pair.endsWith('JPY') ? 3 : 5} decimals.`);
    return parts.join('\n\n');
  }

  private async complete(model: string, instructions: string, input: string, temperature: number): Promise<string> {
    const request = {
      model,
      instructions,
      input,
      text: { format: { type: 'json_schema' as const, name: 'trade_idea', schema: TRADE_SCHEMA, strict: true } },
    };
    try {
      const res = await this.client().responses.create({ ...request, temperature });
      return res.output_text;
    } catch (err: any) {
      // Reasoning models (gpt-5, o-series) reject a custom temperature — retry without it.
      if (err?.status === 400 && /temperature/i.test(err?.message ?? '')) {
        this.logger.debug(`${model} does not accept temperature, retrying without it`);
        const res = await this.client().responses.create(request);
        return res.output_text;
      }
      throw err;
    }
  }
}
