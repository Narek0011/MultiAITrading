/**
 * Backtest of expiry-style (UP/DOWN) Custom signals on real Twelve Data 1-min history, with no lookahead.
 * Compares the old 15-min indicator votes with the new 1-min trend-pullback setup, both settled the same way:
 * entry = price when posted, result = price `expiry` minutes later (each read from the 1-min candle at that instant).
 *
 *   TWELVE_DATA_API_KEY=… npx ts-node --transpile-only scripts/backtest-expiry.ts [--days 10] [--expiry 5] [--every 20] [--step 5] [--rpm 8]
 *     [--pairs EUR/USD,GBP/USD] [--rsi 7] [--pullback 40] [--minAtr 0.5] [--maxAtr 5] [--hours 7-21]
 *
 * Candles are cached in .cache/backtest, so re-runs with other thresholds don't hit the API.
 */
import { promises as fs } from 'fs';
import { join } from 'path';
import { DEFAULT_EXPIRY_PARAMS, ExpiryParams, expirySetup } from '../src/analysis/expiry.strategy';
import { voteIndicators } from '../src/analysis/indicator.strategy';
import { computeIndicators } from '../src/analysis/indicators';
import { dropClosedCandles } from '../src/common/forex';
import { Candle } from '../src/common/types';
import { DEFAULT_PAIRS } from '../src/pairs/pairs.service';
import { DEFAULT_SETTINGS } from '../src/settings/settings.defaults';
import { expiryOutcome } from '../src/signals/result-evaluator';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DAYS = Number(arg('days', '10'));
const EXPIRY_MIN = Number(arg('expiry', '5'));
const EVERY_MIN = Number(arg('every', '20'));
const STEP_MIN = Number(arg('step', '5'));
const RPM = Number(arg('rpm', '8'));
const PAIRS = arg('pairs', DEFAULT_PAIRS.join(',')).split(',').map((p) => p.trim()).filter(Boolean);
const [HOUR_FROM, HOUR_TO] = arg('hours', '0-24').split('-').map(Number);
const PARAMS: ExpiryParams = {
  ...DEFAULT_EXPIRY_PARAMS,
  rsiPeriod: Number(arg('rsi', String(DEFAULT_EXPIRY_PARAMS.rsiPeriod))),
  pullbackRsi: Number(arg('pullback', String(DEFAULT_EXPIRY_PARAMS.pullbackRsi))),
  minAtrPips: Number(arg('minAtr', String(DEFAULT_EXPIRY_PARAMS.minAtrPips))),
  maxAtrPips: Number(arg('maxAtr', String(DEFAULT_EXPIRY_PARAMS.maxAtrPips))),
};
const API_KEY = process.env.TWELVE_DATA_API_KEY ?? '';
const CACHE = join(process.cwd(), '.cache', 'backtest');
const MIN = 60_000;
/** 1-min history each decision sees (as in production). */
const WINDOW = 1500;

let lastRequest = 0;
async function fetchPage(symbol: string, endDate?: string): Promise<Candle[]> {
  const wait = lastRequest + Math.ceil(60_000 / RPM) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const url = new URL('https://api.twelvedata.com/time_series');
  const params: Record<string, string> = { symbol, interval: '1min', outputsize: '5000', timezone: 'UTC', apikey: API_KEY };
  if (endDate) params.end_date = endDate;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const data: any = await (await fetch(url)).json();
  if (data.status === 'error') throw new Error(`${symbol}: ${data.message}`);
  return (data.values ?? [])
    .map((v: any) => ({ time: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
    .reverse();
}

/** `DAYS` of 1-min candles (plus warm-up), paged backwards 5000 at a time, cached on disk. */
async function history(symbol: string): Promise<Candle[]> {
  const file = join(CACHE, `${symbol.replace('/', '')}-${DAYS}d.json`);
  const cached = await fs.readFile(file, 'utf8').catch(() => null);
  if (cached) return JSON.parse(cached);
  if (!API_KEY) throw new Error('Set TWELVE_DATA_API_KEY (or run once with it so the cache exists)');
  const from = Date.now() - (DAYS + 2) * 24 * 60 * MIN;
  let candles: Candle[] = [];
  let end: string | undefined;
  for (let page = 0; page < 20; page++) {
    const chunk = await fetchPage(symbol, end);
    if (!chunk.length) break;
    candles = [...chunk.filter((c) => !candles.length || c.time < candles[0].time), ...candles];
    process.stdout.write(`  ${symbol}: ${candles.length} candles back to ${new Date(candles[0].time).toISOString().slice(0, 16)}\r`);
    if (candles[0].time <= from) break;
    end = new Date(candles[0].time - MIN).toISOString().slice(0, 19).replace('T', ' ');
  }
  process.stdout.write('\n');
  candles = dropClosedCandles(candles);
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, JSON.stringify(candles));
  return candles;
}

/** The old Custom logic: indicator votes on 15-min candles including the one still forming, as production ran it. */
function oldSetup(m1: Candle[]): 'BUY' | 'SELL' | 'NONE' {
  const cfg = DEFAULT_SETTINGS.custom;
  const m15: Candle[] = [];
  for (const c of m1) {
    const start = Math.floor(c.time / (15 * MIN)) * 15 * MIN;
    const cur = m15[m15.length - 1];
    if (cur && cur.time === start) Object.assign(cur, { high: Math.max(cur.high, c.high), low: Math.min(cur.low, c.low), close: c.close });
    else m15.push({ ...c, time: start });
  }
  const v = voteIndicators(computeIndicators(m15.slice(-200), { ...cfg, atrPeriod: 14 }), cfg);
  const bull = v.bull.length >= cfg.requiredConfirmations && v.freshBull;
  const bear = v.bear.length >= cfg.requiredConfirmations && v.freshBear;
  return bull === bear ? 'NONE' : bull ? 'BUY' : 'SELL';
}

interface Trade {
  pair: string;
  at: number;
  direction: 'BUY' | 'SELL';
  confidence: number;
  outcome: 'WIN' | 'LOSS' | 'EXPIRED';
}

function summary(label: string, trades: Trade[]) {
  const w = trades.filter((t) => t.outcome === 'WIN').length;
  const l = trades.filter((t) => t.outcome === 'LOSS').length;
  const rate = w + l ? (w / (w + l)) * 100 : 0;
  return { label, trades: trades.length, wins: w, losses: l, ties: trades.length - w - l, winRate: `${rate.toFixed(1)}%` };
}

function table(title: string, rows: ReturnType<typeof summary>[]) {
  console.log(`\n${title}`);
  console.table(rows.filter((r) => r.trades > 0));
}

function groupBy(trades: Trade[], key: (t: Trade) => string) {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([k, v]) => summary(k, v));
}

async function main() {
  console.log(`Backtest: ${PAIRS.length} pairs, ${DAYS} days, ${EXPIRY_MIN}-min expiry, decision every ${STEP_MIN} min, slots every ${EVERY_MIN} min, UTC hours ${HOUR_FROM}-${HOUR_TO}`);
  console.log('Params:', PARAMS);
  const start = Date.now() - DAYS * 24 * 60 * MIN;
  const all: { old: Trade[]; neu: Trade[] } = { old: [], neu: [] };

  for (const pair of PAIRS) {
    const m1 = await history(pair);
    const index = new Map(m1.map((c, i) => [c.time, i]));
    for (let i = WINDOW; i < m1.length; i++) {
      // Decide at the start of minute t, seeing only candles that closed before it.
      const t = m1[i].time;
      if (t < start || (t / MIN) % STEP_MIN !== 0) continue;
      const hour = new Date(t).getUTCHours();
      if (hour < HOUR_FROM || hour >= HOUR_TO) continue;
      const exitIdx = index.get(t + EXPIRY_MIN * MIN);
      if (exitIdx == null) continue; // the market closed or data is missing before expiry
      // Both instants are minute starts, so the price there is that minute's open.
      const entry = m1[i].open;
      const exit = m1[exitIdx].open;
      const seen = m1.slice(i - WINDOW, i);

      const neu = expirySetup(pair, seen, PARAMS);
      if (neu.direction !== 'NONE') all.neu.push({ pair, at: t, direction: neu.direction, confidence: neu.confidence, outcome: expiryOutcome(neu.direction, entry, exit) });
      // Production saw the forming 15-min candle up to now; that is `seen` too, since it ends right before t.
      const old = oldSetup(seen);
      if (old !== 'NONE') all.old.push({ pair, at: t, direction: old, confidence: 0, outcome: expiryOutcome(old, entry, exit) });
    }
    console.log(`${pair}: old ${all.old.filter((t) => t.pair === pair).length} setups, new ${all.neu.filter((t) => t.pair === pair).length} setups`);
  }

  // What the channel would get: one signal per slot, the most confident pair (old: first in pair order, as before).
  const perSlot = (trades: Trade[]) => {
    const slots = new Map<number, Trade>();
    for (const t of trades) {
      if ((t.at / MIN) % EVERY_MIN !== 0) continue;
      const cur = slots.get(t.at);
      if (!cur || t.confidence > cur.confidence) slots.set(t.at, t);
    }
    return [...slots.values()];
  };

  table('All setups (every decision point)', [summary('old 15m votes', all.old), summary('new 1m pullback', all.neu)]);
  table(`Posted (best pair per ${EVERY_MIN}-min slot)`, [summary('old', perSlot(all.old)), summary('new', perSlot(all.neu))]);
  table('New — by confidence', groupBy(all.neu, (t) => `${Math.floor(t.confidence / 5) * 5}-${Math.floor(t.confidence / 5) * 5 + 4}%`));
  table('New — by UTC hour', groupBy(all.neu, (t) => `${String(new Date(t.at).getUTCHours()).padStart(2, '0')}h`));
  table('New — by pair', groupBy(all.neu, (t) => t.pair));
  table('New — by direction', groupBy(all.neu, (t) => t.direction));
  const days = new Set(perSlot(all.neu).map((t) => new Date(t.at).toISOString().slice(0, 10))).size;
  console.log(`\nNew posted signals per trading day: ${(perSlot(all.neu).length / Math.max(1, days)).toFixed(1)}`);
  console.log('Break-even win rate: 54.1% at 85% payout, 52.1% at 92% payout.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
