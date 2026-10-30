import { Lang, NewsChannel, NewsLang, NewsSettings } from '../settings/settings.types';

const LANGS: NewsLang[] = ['en', 'ru', 'es', 'hy'];

/** A public channel's link follows from its @name, so an empty link field still works. */
export const channelLink = (url: string, chatId: string) => url || (/^@\w{4,}$/.test(chatId) ? `https://t.me/${chatId.slice(1)}` : '');

/** Every configured channel. Before any channel is added, the legacy single channel acts as "main". */
export function newsChannels(cfg: NewsSettings): NewsChannel[] {
  const raw = cfg.channels ?? [];
  if (!raw.length) {
    const chatId = cfg.channelId.trim();
    return chatId ? [{ key: 'main', name: chatId, chatId, url: cfg.channelUrl.trim(), language: cfg.language, enabled: true }] : [];
  }
  return raw
    .map((c: any) => ({
      key: String(c?.key ?? '').trim(),
      name: String(c?.name ?? '').trim(),
      chatId: String(c?.chatId ?? '').trim(),
      url: channelLink(String(c?.url ?? '').trim(), String(c?.chatId ?? '').trim()),
      language: LANGS.includes(c?.language) ? (c.language as NewsLang) : cfg.language,
      enabled: c?.enabled !== false && c?.enabled !== 'false',
    }))
    .filter((c) => c.key && c.chatId)
    .map((c) => ({ ...c, name: c.name || c.chatId }));
}

/**
 * News link for a website page in `lang`: the only channel if there is one, else the channel in that language,
 * else the default website channel, else the first. Only active channels with a link count.
 */
export function websiteNewsUrl(cfg: NewsSettings, lang: Lang): string | null {
  const withUrl = newsChannels(cfg).filter((c) => c.enabled && c.url);
  const picked =
    (withUrl.length === 1 ? withUrl[0] : undefined) ??
    withUrl.find((c) => c.language === lang) ??
    withUrl.find((c) => c.key === cfg.websiteChannel) ??
    withUrl[0];
  return picked?.url || cfg.channelUrl || null;
}
