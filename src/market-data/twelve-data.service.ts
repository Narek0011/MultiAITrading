import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { Candle } from '../common/types';
import { dropClosedCandles, WEEKEND_BARS } from '../common/forex';
import { Timeframe } from '../settings/settings.types';

const BASE_URL = 'https://api.twelvedata.com';

export interface RequestOptions {
  /** Jumps ahead of queued scan requests (expiry settlement, entry price, last-second confirmation). */
  priority?: boolean;
}

interface QueuedRequest {
  priority: boolean;
  run: () => Promise<void>;
}

@Injectable()
export class TwelveDataService {
  private readonly logger = new Logger(TwelveDataService.name);
  private pending: QueuedRequest[] = [];
  private draining = false;
  private lastRequestAt = 0;
  /** Instants a priority request is expected at (e.g. an expiry); scan requests hold back so a slot is free then. */
  private reserved: number[] = [];

  constructor(private readonly settings: SettingsService) {}

  /** Candles in chronological order (oldest first), weekend bars removed. */
  async getCandles(symbol: string, interval: Timeframe, outputsize: number, opts: RequestOptions = {}): Promise<Candle[]> {
    const size = Math.min(5000, outputsize + WEEKEND_BARS[interval]);
    const data = await this.request('/time_series', { symbol, interval, outputsize: String(size), timezone: 'UTC' }, true, opts.priority);
    const values: any[] = data.values ?? [];
    const candles = values
      .map((v) => ({
        time: Date.parse(v.datetime.replace(' ', 'T') + 'Z'),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
      }))
      .reverse();
    return dropClosedCandles(candles).slice(-outputsize);
  }

  async getPrice(symbol: string, opts: RequestOptions = {}): Promise<number> {
    const data = await this.request('/price', { symbol }, true, opts.priority);
    return Number(data.price);
  }

  /** Validates the key and returns the remaining daily credits. */
  async testConnection() {
    const data = await this.request('/api_usage', {}, false);
    const price = await this.getPrice('EUR/USD');
    return { eurUsd: price, usage: data };
  }

  /** Keeps the request slot at `at` free for a priority request (scan requests wait rather than use it). */
  reserve(at: number) {
    this.reserved.push(at);
  }

  /** Serialises throttled requests so the plan's per-minute limit is never exceeded; priority ones go first. */
  private request(path: string, params: Record<string, string>, throttled = true, priority = false): Promise<any> {
    if (!throttled) return this.fetchJson(path, params);
    return new Promise((resolve, reject) => {
      const task: QueuedRequest = { priority, run: () => this.fetchJson(path, params).then(resolve, reject) };
      const firstNormal = this.pending.findIndex((t) => !t.priority);
      if (priority && firstNormal >= 0) this.pending.splice(firstNormal, 0, task);
      else this.pending.push(task);
      void this.drain();
    });
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length) {
        const gap = Math.ceil(60_000 / Math.max(1, this.settings.get('marketData').requestsPerMinute));
        let wait = this.lastRequestAt + gap - Date.now();
        if (!this.pending[0].priority) wait = Math.max(wait, this.reservedWait(gap));
        if (wait > 0) {
          // A priority request may arrive while waiting; re-check the head of the queue in short steps.
          await new Promise((r) => setTimeout(r, Math.min(wait, 1_000)));
          continue;
        }
        this.lastRequestAt = Date.now();
        await this.pending.shift()!.run();
      }
    } finally {
      this.draining = false;
    }
  }

  /** How long a scan request must wait so it doesn't take the request slot a reserved instant needs. */
  private reservedWait(gap: number) {
    const now = Date.now();
    // A reservation stays active a little past its instant, until its request has been made.
    this.reserved = this.reserved.filter((at) => at > now - 15_000 && at > this.lastRequestAt);
    const blocking = this.reserved.filter((at) => now + gap > at);
    return blocking.length ? Math.max(...blocking) + 15_000 - now : 0;
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
