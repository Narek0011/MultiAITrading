import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { friendlyOpenAiError, isRateLimit, retryDelayMs } from '../news/news-writer';
import { SettingsService } from '../settings/settings.service';

const ATTEMPTS = 4;
const logger = new Logger('OpenAI');

/** Key and model for content features (news, TikTok): the news page's own key if set, otherwise the AI settings key. */
export function contentAi(settings: SettingsService) {
  const news = settings.get('news');
  const apiKey = news.apiKey.trim() || settings.get('ai').apiKey;
  if (!apiKey) throw new Error('OpenAI API key is not set (Admin → News channel or AI settings)');
  // Web search can be slow, so allow 3 min. Retries are handled in askOpenAi so rate limits can wait as long as OpenAI asks.
  return { client: new OpenAI({ apiKey, timeout: 180_000, maxRetries: 0 }), model: news.model.trim() || 'gpt-5-mini' };
}

/**
 * Responses API call that waits out per-minute rate limits instead of failing right away, and uses low reasoning
 * effort for reasoning models. Returns the output text.
 */
export async function askOpenAi(client: OpenAI, request: Record<string, unknown>, onNote?: (note: string) => void): Promise<string> {
  if (/^(gpt-5|o\d)/.test(String(request.model))) request.reasoning = { effort: 'low' };
  for (let attempt = 1; ; attempt++) {
    try {
      const res: any = await client.responses.create(request as any);
      if (res.status === 'incomplete') throw Object.assign(new Error(`The AI stopped before finishing (${res.incomplete_details?.reason ?? 'incomplete'}) — try again`), { final: true });
      return res.output_text ?? '';
    } catch (err: any) {
      if (err?.final) throw err;
      if (!isRateLimit(err) || attempt >= ATTEMPTS) throw new Error(friendlyOpenAiError(err));
      const wait = retryDelayMs(err);
      onNote?.(`waiting ${Math.round(wait / 1000)}s for the OpenAI limit (try ${attempt + 1}/${ATTEMPTS})`);
      logger.warn(`Rate limit, retrying in ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Pulls the JSON object out of a model reply (tool-using replies sometimes wrap it in prose). */
export function parseJsonReply(raw: string): any {
  const json = raw.trim().startsWith('{') ? raw : (/\{[\s\S]*\}/.exec(raw)?.[0] ?? '');
  if (!json) throw new Error('The AI returned no data — try again');
  return JSON.parse(json);
}
