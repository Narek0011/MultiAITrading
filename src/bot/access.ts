import { Lang } from '../settings/settings.types';
import { TelegramService } from '../telegram/telegram.service';

/** Pocket Option trader ids are plain numbers; tolerate spaces and a leading "ID". */
export function parsePocketId(text: string): string | null {
  const id = text.replace(/^\s*id[:\s]*/i, '').replace(/\s+/g, '');
  return /^\d{5,12}$/.test(id) ? id : null;
}

export const parseAdminIds = (value: string) => value.split(/[\s,;]+/).filter((v) => /^\d+$/.test(v));

/** Channel id in settings is either the numeric -100… id or @username. */
export function isConfiguredChannel(channelId: string, chat: { id: number | string; username?: string }) {
  const id = channelId.trim().toLowerCase();
  return id === String(chat.id) || (!!chat.username && id === `@${chat.username.toLowerCase()}`);
}

export const langFromCode = (code?: string): Lang => (code?.startsWith('ru') ? 'ru' : code?.startsWith('es') ? 'es' : 'en');

export const isUrl = (v: string) => /^(https?:\/\/|tg:\/\/)\S+$/.test(v ?? '');

/** Sends admin-written HTML; falls back to plain text when Telegram can't parse it. */
export async function callHtml(telegram: TelegramService, method: string, payload: Record<string, unknown>) {
  try {
    return await telegram.call(method, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...payload });
  } catch (err: any) {
    if (!/parse entities/i.test(err.message)) throw err;
    return telegram.call(method, { link_preview_options: { is_disabled: true }, ...payload });
  }
}
