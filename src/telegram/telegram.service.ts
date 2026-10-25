import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { telegramText } from './messages';

export class TelegramApiError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly settings: SettingsService) {}

  /** Returns the posted message id. `chatId` defaults to the signals channel. */
  async sendPhoto(photo: Buffer, caption: string, chatId?: string): Promise<number> {
    const form = new FormData();
    form.set('chat_id', chatId || this.channel());
    if (caption) form.set('caption', caption);
    form.set('parse_mode', 'HTML');
    form.set('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'signal.png');
    const msg = await this.call('sendPhoto', form);
    return msg.message_id;
  }

  async sendMessage(text: string, replyTo?: number, chatId?: string): Promise<number> {
    const body: Record<string, unknown> = {
      chat_id: chatId || this.channel(),
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    };
    if (replyTo) body.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
    const msg = await this.call('sendMessage', body);
    return msg.message_id;
  }

  async test() {
    const me = await this.call('getMe', {});
    const lang = this.settings.get('general').signalLanguage;
    await this.sendMessage(telegramText(lang).test);
    return { bot: `@${me.username}`, channel: this.channel() };
  }

  private channel() {
    const { channelId } = this.settings.get('telegram');
    if (!channelId) throw new Error('Telegram channel ID is not set (Admin → Telegram)');
    return channelId;
  }

  /** Raw Bot API call. `timeoutMs` must exceed the long-poll timeout for getUpdates. */
  async call(method: string, body: FormData | Record<string, unknown>, timeoutMs = 30_000): Promise<any> {
    const { botToken } = this.settings.get('telegram');
    if (!botToken) throw new Error('Telegram bot token is not set (Admin → Telegram)');
    const isForm = body instanceof FormData;
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!data.ok) {
      if (method !== 'getUpdates') this.logger.warn(`Telegram ${method} failed: ${data.description ?? res.status}`);
      let message = `Telegram: ${data.description ?? `HTTP ${res.status}`}`;
      if (/chat not found/i.test(message)) {
        message += ' — check Admin → Telegram: the Channel ID must be the channel (starts with -100, or @name for public channels), not a personal ID, and the bot must be an admin of that channel.';
      }
      throw new TelegramApiError(message, data.error_code ?? res.status);
    }
    return data.result;
  }
}
