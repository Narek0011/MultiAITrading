import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { Lang } from '../settings/settings.types';
import { TelegramApiError, TelegramService } from '../telegram/telegram.service';
import { BotChat } from './bot-chat.entity';
import { BotUser } from './bot-user.entity';
import { BUTTON_LABELS, LANGUAGE_BUTTONS, LANGUAGE_PROMPT } from './bot-texts';

const POLL_TIMEOUT_S = 25;
const IDLE_MS = 10_000;

/**
 * Handles private chats with the bot: /start shows a language picker, then the
 * welcome text (editable in Admin → Bot welcome) with channel / support buttons.
 * Uses long polling, so no public webhook URL is needed.
 */
@Injectable()
export class BotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotService.name);
  private running = false;
  private offset = 0;
  private activeToken = '';
  private sleepTimer: NodeJS.Timeout | null = null;
  private wake: (() => void) | null = null;

  /** Shown in Admin → Bot welcome. */
  status: { polling: boolean; botUsername: string | null; lastError: string | null } = {
    polling: false,
    botUsername: null,
    lastError: null,
  };

  constructor(
    @InjectRepository(BotUser) private readonly users: Repository<BotUser>,
    @InjectRepository(BotChat) private readonly chats: Repository<BotChat>,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap() {
    this.running = true;
    // React to a new token / switch immediately instead of after the idle wait.
    this.settings.events.on('changed', (group: string) => {
      if (group === 'telegram' || group === 'bot') this.wake?.();
    });
    void this.loop();
  }

  onApplicationShutdown() {
    this.running = false;
    this.wake?.();
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      this.wake = () => {
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.wake = null;
        resolve();
      };
      this.sleepTimer = setTimeout(() => this.wake?.(), ms);
    });
  }

  private async loop() {
    while (this.running) {
      const token = this.settings.get('telegram').botToken;
      if (!token) {
        this.status.polling = false;
        await this.sleep(IDLE_MS);
        continue;
      }
      try {
        if (token !== this.activeToken) await this.connect(token);
        const updates: any[] = await this.telegram.call(
          'getUpdates',
          { offset: this.offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message', 'callback_query', 'my_chat_member', 'channel_post'] },
          (POLL_TIMEOUT_S + 10) * 1000,
        );
        this.status.polling = true;
        this.status.lastError = null;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handle(update).catch((err) => this.logger.warn(`Bot update failed: ${err.message}`));
        }
      } catch (err: any) {
        this.status.polling = false;
        this.status.lastError =
          err instanceof TelegramApiError && err.code === 409
            ? 'Another app is already reading updates for this bot token (for example a second copy of this app). Only one can run the bot chat at a time.'
            : err.message;
        if (err instanceof TelegramApiError && err.code === 401) this.activeToken = '';
        await this.sleep(IDLE_MS);
      }
    }
  }

  /** First call with a (new) token: drop any webhook, register commands, remember the username. */
  private async connect(token: string) {
    this.offset = 0;
    await this.telegram.call('deleteWebhook', { drop_pending_updates: false });
    const me = await this.telegram.call('getMe', {});
    this.status.botUsername = me.username;
    await this.telegram.call('setMyCommands', { commands: [{ command: 'start', description: 'Start' }, { command: 'language', description: 'Language / Язык / Idioma' }] });
    for (const { lang } of LANGUAGE_BUTTONS) {
      const label = { en: 'Start', ru: 'Начать', es: 'Iniciar' }[lang];
      const language = { en: 'Change language', ru: 'Сменить язык', es: 'Cambiar idioma' }[lang];
      await this.telegram.call('setMyCommands', {
        commands: [{ command: 'start', description: label }, { command: 'language', description: language }],
        language_code: lang,
      });
    }
    this.activeToken = token;
    this.logger.log(`Bot chat connected as @${me.username}`);
  }

  private async handle(update: any) {
    // Channel detection: bot added/removed as admin, or a post seen in a channel.
    const member = update.my_chat_member;
    if (member && member.chat?.type !== 'private') return this.rememberChat(member.chat, member.new_chat_member?.status ?? 'member');
    if (update.channel_post) return this.rememberChat(update.channel_post.chat, 'seen');

    if (!this.settings.get('bot').welcomeEnabled) return;
    if (update.callback_query) return this.onCallback(update.callback_query);
    const msg = update.message;
    if (!msg || msg.chat?.type !== 'private' || !msg.from) return;

    const user = await this.upsertUser(msg.from);
    const text: string = msg.text ?? '';
    if (text.startsWith('/start') || text.startsWith('/language') || !user.language) {
      return this.sendLanguagePicker(msg.chat.id);
    }
    return this.sendWelcome(msg.chat.id, user.language);
  }

  private async onCallback(q: any) {
    const data: string = q.data ?? '';
    await this.telegram.call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => undefined);
    const chatId = q.message?.chat?.id;
    if (!chatId) return;

    if (data === 'lang:menu') return this.sendLanguagePicker(chatId, q.message.message_id);
    const lang = data.startsWith('lang:') ? (data.slice(5) as Lang) : null;
    if (!lang || !LANGUAGE_BUTTONS.some((b) => b.lang === lang)) return;

    await this.upsertUser(q.from, lang);
    // Replace the picker with the welcome so the chat stays clean.
    await this.sendWelcome(chatId, lang, q.message.message_id);
  }

  private sendLanguagePicker(chatId: number, editMessageId?: number) {
    const reply_markup = { inline_keyboard: [LANGUAGE_BUTTONS.map((b) => ({ text: b.label, callback_data: `lang:${b.lang}` }))] };
    return editMessageId
      ? this.telegram.call('editMessageText', { chat_id: chatId, message_id: editMessageId, text: LANGUAGE_PROMPT, parse_mode: 'HTML', reply_markup })
      : this.telegram.call('sendMessage', { chat_id: chatId, text: LANGUAGE_PROMPT, parse_mode: 'HTML', reply_markup });
  }

  private async sendWelcome(chatId: number, lang: Lang, editMessageId?: number) {
    const bot = this.settings.get('bot');
    const landing = this.settings.get('landing');
    const labels = BUTTON_LABELS[lang];
    const text = { en: bot.welcomeEn, ru: bot.welcomeRu, es: bot.welcomeEs }[lang] || bot.welcomeEn;

    const rows: any[][] = [];
    if (bot.showChannelButton && isUrl(landing.signalsChannelUrl)) rows.push([{ text: labels.channel, url: landing.signalsChannelUrl }]);
    if (bot.showSupportButton && isUrl(landing.supportUrl)) rows.push([{ text: labels.support, url: landing.supportUrl }]);
    rows.push([{ text: labels.language, callback_data: 'lang:menu' }]);

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: rows },
    };
    const method = editMessageId ? 'editMessageText' : 'sendMessage';
    if (editMessageId) payload.message_id = editMessageId;
    try {
      await this.telegram.call(method, payload);
    } catch (err: any) {
      // Admin-written text with broken HTML: send it as plain text instead of failing.
      if (!/parse entities/i.test(err.message)) throw err;
      delete payload.parse_mode;
      await this.telegram.call(method, payload);
    }
  }

  private async upsertUser(from: any, language?: Lang) {
    const existing = await this.users.findOneBy({ id: String(from.id) });
    const user = this.users.create({
      ...(existing ?? {}),
      id: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? '',
      language: language ?? existing?.language ?? null,
    });
    return this.users.save(user);
  }

  private async rememberChat(chat: any, status: string) {
    const existing = await this.chats.findOneBy({ id: String(chat.id) });
    // A post doesn't tell us the bot's role — keep a known status (e.g. administrator).
    const finalStatus = status === 'seen' && existing ? existing.status : status;
    await this.chats.save({ id: String(chat.id), title: chat.title ?? '', type: chat.type, username: chat.username ?? null, status: finalStatus });
    this.logger.log(`Bot ${finalStatus} in ${chat.type} "${chat.title}" (${chat.id})`);
  }

  detectedChats() {
    return this.chats.find({ order: { updatedAt: 'DESC' } });
  }

  async overview() {
    const [total, recent, byLang] = await Promise.all([
      this.users.count(),
      this.users.find({ order: { createdAt: 'DESC' }, take: 20 }),
      this.users.createQueryBuilder('u').select('u.language', 'language').addSelect('COUNT(*)::int', 'count').groupBy('u.language').getRawMany(),
    ]);
    return { status: this.status, total, byLang, recent };
  }
}

const isUrl = (v: string) => /^(https?:\/\/|tg:\/\/)\S+$/.test(v ?? '');
