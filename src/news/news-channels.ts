import { Lang, NewsChannel, NewsSettings } from '../settings/settings.types';

const LANGS: Lang[] = ['en', 'ru', 'es'];

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
      url: String(c?.url ?? '').trim(),
      language: LANGS.includes(c?.language) ? (c.language as Lang) : cfg.language,
      enabled: c?.enabled !== false && c?.enabled !== 'false',
    }))
    .filter((c) => c.key && c.chatId)
    .map((c) => ({ ...c, name: c.name || c.chatId }));
}

/** Public link of the channel picked for the website (falls back to the first channel with a link). */
export function websiteNewsUrl(cfg: NewsSettings): string | null {
  const withUrl = newsChannels(cfg).filter((c) => c.url);
  const picked = withUrl.find((c) => c.key === cfg.websiteChannel) ?? withUrl[0];
  return picked?.url || cfg.channelUrl || null;
}
