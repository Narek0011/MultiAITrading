/**
 * Smoke test of the bot welcome flow with a fake Telegram API (uses its own database).
 *   DATABASE_URL=postgres://localhost/multiaitrading_smoke npx ts-node --transpile-only scripts/smoke-bot.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BotService } from '../src/bot/bot.service';
import { SettingsService } from '../src/settings/settings.service';

const from = { id: 777000111, first_name: 'Test', username: 'tester' };
const queue: any[][] = [
  [{ update_id: 1, message: { message_id: 10, chat: { id: from.id, type: 'private' }, from, text: '/start' } }],
  [{ update_id: 2, callback_query: { id: 'cb1', from, data: 'lang:ru', message: { message_id: 11, chat: { id: from.id } } } }],
  [{ update_id: 3, message: { message_id: 12, chat: { id: from.id, type: 'private' }, from, text: 'hello' } }],
  [{ update_id: 4, callback_query: { id: 'cb2', from, data: 'lang:menu', message: { message_id: 13, chat: { id: from.id } } } }],
  [{ update_id: 5, my_chat_member: { chat: { id: -1004332612443, title: 'AI Trading', type: 'channel' }, new_chat_member: { status: 'administrator' } } }],
  [{ update_id: 6, channel_post: { message_id: 1, chat: { id: -1004332612443, title: 'AI Trading', type: 'channel' }, text: 'test' } }],
];
const calls: { method: string; body: any }[] = [];
const realFetch = global.fetch;
global.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (!url.startsWith('https://api.telegram.org/')) return realFetch(input, init);
  const method = url.split('/').pop()!;
  const body = init?.body ? JSON.parse(init.body) : {};
  if (method !== 'getUpdates') calls.push({ method, body });
  const result = method === 'getUpdates' ? queue.shift() ?? [] : method === 'getMe' ? { username: 'multiai_test_bot' } : true;
  if (method === 'getUpdates' && !result.length) await new Promise((r) => setTimeout(r, 200));
  return new Response(JSON.stringify({ ok: true, result }));
}) as typeof fetch;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const settings = app.get(SettingsService);
  await settings.update('telegram', { botToken: 'smoke' });
  await settings.update('landing', { signalsChannelUrl: 'https://t.me/demo_channel', supportUrl: 'https://t.me/demo_support' });
  await settings.update('bot', { welcomeEnabled: true });
  await new Promise((r) => setTimeout(r, 3000));

  const sent = calls.filter((c) => ['sendMessage', 'editMessageText'].includes(c.method));
  for (const c of sent) {
    console.log(`\n${c.method} →`, c.body.text.split('\n')[0]);
    console.log('  buttons:', c.body.reply_markup.inline_keyboard.flat().map((b: any) => b.text + (b.url ? ` (${b.url})` : '')).join(' | '));
  }
  const overview = await app.get(BotService).overview();
  console.log('\nstatus:', overview.status, '\nusers:', overview.recent.map((u) => `${u.firstName} @${u.username} ${u.language}`));
  const ok =
    sent.length === 4 &&
    sent[0].body.text.includes('Choose your language') &&
    sent[1].method === 'editMessageText' && sent[1].body.text.includes('Добро пожаловать') &&
    sent[2].body.text.includes('Добро пожаловать') &&
    sent[3].body.text.includes('Choose your language') &&
    overview.recent[0]?.language === 'ru';
  const chats = await app.get(BotService).detectedChats();
  console.log('detected chats:', chats.map((c) => `${c.title} ${c.id} ${c.status}`));
  const chatsOk = chats.length === 1 && chats[0].id === '-1004332612443' && chats[0].status === 'administrator';
  await app.close();
  console.log(ok && chatsOk ? '\nBOT SMOKE OK' : '\nBOT SMOKE FAILED');
  process.exit(ok && chatsOk ? 0 : 1);
}
main();
