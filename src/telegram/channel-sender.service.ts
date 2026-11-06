import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ActivityLogService } from '../signals/activity-log.service';
import { applyPremiumEmoji, emojiMap, stripPremiumEmoji } from './premium-emoji';
import { TelegramUserService } from './telegram-user.service';
import { TelegramApiError, TelegramService } from './telegram.service';

/**
 * Everything posted to channels goes through here. With a logged-in (Premium) Telegram account the post
 * goes out from it with custom emoji; if that fails, or no account is set up, the bot posts instead
 * (custom emoji removed when Telegram refuses them from the bot).
 */
@Injectable()
export class ChannelSender {
  constructor(
    private readonly settings: SettingsService,
    private readonly bot: TelegramService,
    private readonly user: TelegramUserService,
    private readonly log: ActivityLogService,
  ) {}

  sendPhoto(photo: Buffer, caption: string, chatId: string, type: 'png' | 'jpeg' = 'png'): Promise<number> {
    return this.send(chatId, (html, viaUser) => (viaUser ? this.user.sendPhoto(photo, html, chatId, type) : this.bot.sendPhoto(photo, html, chatId, type)), caption);
  }

  sendMessage(text: string, replyTo: number | undefined, chatId: string): Promise<number> {
    return this.send(chatId, (html, viaUser) => (viaUser ? this.user.sendMessage(html, replyTo, chatId) : this.bot.sendMessage(html, replyTo, chatId)), text);
  }

  /** Deletes a post; whoever sent it can delete it, so the account is tried first, then the bot. */
  async deleteMessage(chatId: string, messageId: number) {
    if (this.user.active) {
      try {
        return await this.user.deleteMessage(chatId, messageId);
      } catch {
        // posted by the bot, or the account lost access — try the bot
      }
    }
    await this.bot.deleteMessage(chatId, messageId);
  }

  private async send(chatId: string, post: (html: string, viaUser: boolean) => Promise<number>, html: string): Promise<number> {
    if (this.user.active) {
      try {
        return await post(applyPremiumEmoji(html, emojiMap(this.settings.get('telegram'))), true);
      } catch (err: any) {
        this.log.add('warn', `Posting from the Telegram account to ${chatId} failed (${err.message}) — posted by the bot instead`);
      }
    }
    try {
      return await post(html, false);
    } catch (err) {
      // Custom emoji only work for bots with a username bought on Fragment — fall back to normal emoji.
      if (!(err instanceof TelegramApiError) || !html.includes('<tg-emoji')) throw err;
      this.log.add('warn', `Custom emoji rejected by Telegram (${err.message}) — posted with normal emoji`);
      return post(stripPremiumEmoji(html), false);
    }
  }
}
