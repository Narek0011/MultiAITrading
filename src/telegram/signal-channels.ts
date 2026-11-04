import { BadRequestException } from '@nestjs/common';
import { SignalChannel, SignalLang } from '../settings/settings.types';

const LANGS: SignalLang[] = ['en', 'ru', 'es', 'hy'];

/** Every configured signal channel; before any are added, the old single channel in the AI analysis language as "main". */
export function signalChannels(tg: { channelId: string; channels?: unknown[] }, fallbackLang: SignalLang): SignalChannel[] {
  const raw = tg.channels ?? [];
  if (!raw.length) {
    const chatId = (tg.channelId ?? '').trim();
    return chatId ? [{ key: 'main', name: chatId, chatId, language: fallbackLang, enabled: true }] : [];
  }
  const seen = new Set<string>();
  return raw
    .map((c: any, i) => ({
      key: String(c?.key ?? '').trim() || `ch${i + 1}`,
      name: String(c?.name ?? '').trim(),
      chatId: String(c?.chatId ?? '').trim(),
      language: LANGS.includes(c?.language) ? (c.language as SignalLang) : 'en',
      enabled: c?.enabled !== false && c?.enabled !== 'false',
    }))
    .filter((c) => c.chatId && !seen.has(c.key) && seen.add(c.key))
    .map((c) => ({ ...c, name: c.name || c.chatId }));
}

export const activeSignalChannels = (tg: { channelId: string; channels?: unknown[] }, fallbackLang: SignalLang) =>
  signalChannels(tg, fallbackLang).filter((c) => c.enabled);

/** Why a chat id can't be a channel, or null when it looks fine. */
export function badChatId(chatId: string): string | null {
  if (/t\.me\//.test(chatId)) return `"${chatId}" is a link, not an ID. Use -100… or @name.`;
  if (/^\d+$/.test(chatId)) return `"${chatId}" looks like a personal user ID. A channel ID is negative and starts with -100.`;
  if (/^-\d+$/.test(chatId) && !chatId.startsWith('-100')) return `Private channel IDs start with -100 (e.g. -100${chatId.slice(1)}).`;
  return null;
}

/** Cleans the channel list sent by the admin and keeps `channelId` = the first active channel. */
export function normaliseTelegramBody(body: Record<string, unknown>, fallbackLang: SignalLang) {
  if (!Array.isArray(body.channels)) return;
  const list = signalChannels({ channelId: '', channels: body.channels }, fallbackLang);
  for (const c of list) {
    const bad = badChatId(c.chatId);
    if (bad) throw new BadRequestException(`${c.name}: ${bad}`);
  }
  body.channels = list;
  const main = list.find((c) => c.enabled);
  if (main) body.channelId = main.chatId;
}
