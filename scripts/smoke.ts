/**
 * End-to-end smoke test of the signal pipeline without real API keys.
 * Twelve Data and Telegram are stubbed via global fetch; uses its own database.
 *   DATABASE_URL=postgres://localhost/multiaitrading_smoke npx ts-node --transpile-only scripts/smoke.ts
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { demoCandles } from '../src/charts/demo-candles';
import { SettingsService } from '../src/settings/settings.service';
import { ResultTrackerService } from '../src/signals/result-tracker.service';
import { SignalsService } from '../src/signals/signals.service';
import { ActivityLogService } from '../src/signals/activity-log.service';
import { Signal } from '../src/signals/signal.entity';

const posted: { method: string; caption?: string }[] = [];
let phase: 'scan' | 'track' = 'scan';
const realFetch = global.fetch;

global.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url.startsWith('https://api.twelvedata.com/time_series')) {
    const u = new URL(url);
    const size = Number(u.searchParams.get('outputsize'));
    const seed = [...u.searchParams.get('symbol')!].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    let candles = demoCandles(Math.max(size, 5), 1.08, 15 * 60_000, seed);
    if (phase === 'track') {
      // Candles after the signal: a big up-move then a big down-move, so every signal resolves.
      const now = Date.now();
      candles = [
        { time: now - 60_000, open: 1, high: 99, low: 1, close: 1 },
      ];
    } else {
      const shift = Date.now() - candles[candles.length - 1].time;
      candles = candles.map((c) => ({ ...c, time: c.time + shift }));
    }
    const values = candles.reverse().map((c) => ({
      datetime: new Date(c.time).toISOString().slice(0, 19).replace('T', ' '),
      open: String(c.open), high: String(c.high), low: String(c.low), close: String(c.close),
    }));
    return new Response(JSON.stringify({ status: 'ok', values }));
  }
  if (url.startsWith('https://api.telegram.org/')) {
    const method = url.split('/').pop()!;
    const caption = init?.body instanceof FormData ? String(init.body.get('caption')) : JSON.parse(init.body).text;
    posted.push({ method, caption });
    return new Response(JSON.stringify({ ok: true, result: { message_id: posted.length, username: 'smoke_bot' } }));
  }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  await ds.getRepository(Signal).clear();
  await ds.query(`UPDATE pairs SET "lastSignalAt" = NULL`);

  const settings = app.get(SettingsService);
  await settings.update('general', { mode: 'CUSTOM', maxSignalsPerDay: 50, pairCooldownMinutes: 0 });
  await settings.update('custom', { requiredConfirmations: 1, minConfidence: 0 });
  await settings.update('marketData', { apiKey: 'smoke', requestsPerMinute: 2000 });
  await settings.update('telegram', { botToken: 'smoke', channelId: '@smoke', postResults: true });

  const signals = app.get(SignalsService);
  const res = await signals.scan(true);
  const saved = await ds.getRepository(Signal).find();
  console.log(`scan: posted=${res.posted}, rows=${saved.length}, photos=${posted.filter((p) => p.method === 'sendPhoto').length}`);
  if (!res.posted || saved.some((s) => !s.telegramMessageId || !s.imageFile)) throw new Error('scan did not post signals correctly');
  console.log('\nexample caption:\n' + posted[0].caption + '\n');

  phase = 'track';
  // Make candles fall after creation time.
  await ds.query(`UPDATE signals SET "createdAt" = now() - interval '10 minutes'`);
  await app.get(ResultTrackerService).track();
  const after = await ds.getRepository(Signal).find();
  console.log('statuses after tracking:', after.map((s) => `${s.pair}:${s.direction}:${s.status}`).join(', '));
  console.log('replies:', posted.filter((p) => p.method === 'sendMessage').length);
  if (after.some((s) => s.status === 'OPEN')) throw new Error('tracker left signals open');
  console.log('stats:', await signals.stats());
  console.log('\nlog:\n' + app.get(ActivityLogService).list(8).map((l) => `  ${l.level} ${l.message}`).join('\n'));
  await app.close();
  console.log('\nSMOKE OK');
}
main().catch((e) => { console.error('SMOKE FAILED', e); process.exit(1); });
