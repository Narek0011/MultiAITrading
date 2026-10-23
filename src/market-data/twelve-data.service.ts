import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { Candle } from '../common/types';
import { Timeframe } from '../settings/settings.types';

const BASE_URL = 'https://api.twelvedata.com';

@Injectable()
export class TwelveDataService {
  private readonly logger = new Logger(TwelveDataService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly settings: SettingsService) {}

  /** Candles in chronological order (oldest first). */
  async getCandles(symbol: string, interval: Timeframe, outputsize: number): Promise<Candle[]> {
    const data = await this.request('/time_series', { symbol, interval, outputsize: String(outputsize), timezone: 'UTC' });
    const values: any[] = data.values ?? [];
    return values
      .map((v) => ({
        time: Date.parse(v.datetime.replace(' ', 'T') + 'Z'),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
      }))
      .reverse();
  }

  async getPrice(symbol: string): Promise<number> {
    const data = await this.request('/price', { symbol });
    return Number(data.price);
  }

  /** Validates the key and returns the remaining daily credits. */
  async testConnection() {
    const data = await this.request('/api_usage', {}, false);
    const price = await this.getPrice('EUR/USD');
    return { eurUsd: price, usage: data };
  }

  /** Serialises requests so the plan's per-minute limit is never exceeded. */
  private request(path: string, params: Record<string, string>, throttled = true): Promise<any> {
    const run = async () => {
      if (throttled) {
        const rpm = Math.max(1, this.settings.get('marketData').requestsPerMinute);
        const gap = Math.ceil(60_000 / rpm);
        const wait = this.lastRequestAt + gap - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        this.lastRequestAt = Date.now();
      }
      return this.fetchJson(path, params);
    };
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async fetchJson(path: string, params: Record<string, string>) {
    const apiKey = this.settings.get('marketData').apiKey;
    if (!apiKey) throw new Error('Twelve Data API key is not set (Admin → Market data)');
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries({ ...params, apikey: apiKey })) url.searchParams.set(k, v);

    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      const message = data.message ?? `HTTP ${res.status}`;
      this.logger.warn(`Twelve Data ${path} ${params.symbol ?? ''}: ${message}`);
      throw new Error(`Twelve Data: ${message}`);
    }
    return data;
  }
}
