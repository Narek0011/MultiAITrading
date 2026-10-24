import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { Lang } from '../settings/settings.types';
import { TelegramService } from '../telegram/telegram.service';
import { callHtml, isConfiguredChannel, isUrl, langFromCode, parseAdminIds, parsePocketId } from './access';
import { ACCESS_TEXTS } from './bot-texts';
import { AccessStatus, BotUser } from './bot-user.entity';

/**
 * Signals-channel access: the user registers on Pocket Option with our referral link,
 * sends their trader id, an admin approves it, and only then the bot accepts their
 * join request to the private channel (the invite link requires approval).
 */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    @InjectRepository(BotUser) private readonly users: Repository<BotUser>,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
  ) {}

  get enabled() {
    return this.settings.get('access').enabled;
  }

  isAdmin(userId: number | string) {
    return parseAdminIds(this.settings.get('access').adminTelegramIds).includes(String(userId));
  }

  /** The access screen, depending on where the user is in the flow. */
  async show(chatId: number, user: BotUser, editMessageId?: number) {
    const lang = user.language ?? 'en';
    const t = ACCESS_TEXTS[lang];
    if (!this.enabled) return this.send(chatId, t.unavailable, [], editMessageId);
    if (user.accessStatus === 'approved') return this.sendApproved(chatId, lang, editMessageId);
    if (user.accessStatus === 'pending') return this.send(chatId, t.pending.replace('{id}', user.pocketId ?? ''), [[backButton(lang)]], editMessageId);

    const access = this.settings.get('access');
    const steps = { en: access.stepsEn, ru: access.stepsRu, es: access.stepsEs }[lang] || access.stepsEn;
    const rows: any[][] = [];
    if (isUrl(access.referralUrl)) rows.push([{ text: t.register, url: access.referralUrl }]);
    rows.push([{ text: t.registered, callback_data: 'acc:reg' }]);
    rows.push([backButton(lang)]);
    return this.send(chatId, steps, rows, editMessageId);
  }

  /** "I registered" pressed: wait for the trader id as the next message. */
  async askId(chatId: number, user: BotUser) {
    if (!this.enabled || user.accessStatus === 'approved' || user.accessStatus === 'pending') return this.show(chatId, user);
    await this.users.update(user.id, { accessStatus: 'awaiting_id' });
    return this.send(chatId, ACCESS_TEXTS[user.language ?? 'en'].askId, []);
  }

  /** Handles a private text message; returns false when it isn't part of the access flow. */
  async onText(chatId: number, user: BotUser, text: string): Promise<boolean> {
    if (user.accessStatus !== 'awaiting_id' || !this.enabled) return false;
    const t = ACCESS_TEXTS[user.language ?? 'en'];
    const pocketId = parsePocketId(text);
    if (!pocketId) {
      await this.send(chatId, t.badId, []);
      return true;
    }
    Object.assign(user, { accessStatus: 'pending', pocketId, requestedAt: new Date(), decidedAt: null });
    await this.users.save(user);
    await this.send(chatId, t.pending.replace('{id}', pocketId), []);
    await this.notifyAdmins(user);
    return true;
  }

  /** Approve / reject pressed in an admin's private chat. */
  async onAdminCallback(q: any, action: 'ok' | 'no', userId: string) {
    if (!this.isAdmin(q.from.id)) return;
    let user: BotUser;
    try {
      user = action === 'ok' ? await this.approve(userId) : await this.reject(userId);
    } catch (err: any) {
      await this.send(q.message.chat.id, `⚠️ ${escapeHtml(err.message)}`, []).catch(() => undefined);
      return;
    }
    const verdict = action === 'ok' ? '✅ Approved' : '❌ Rejected';
    await callHtml(this.telegram, 'editMessageText', {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: `${requestSummary(user)}\n\n<b>${verdict}</b> by ${escapeHtml(q.from.first_name ?? 'admin')}`,
    }).catch(() => undefined);
  }

  /** Someone asked to join the private channel through the join-request link. */
  async onJoinRequest(req: any) {
    if (!this.enabled || !isConfiguredChannel(this.settings.get('telegram').channelId, req.chat)) return;
    const user = await this.users.findOneBy({ id: String(req.from.id) });
    const params = { chat_id: req.chat.id, user_id: req.from.id };
    if (user?.accessStatus === 'approved') {
      await this.telegram.call('approveChatJoinRequest', params);
      await this.users.update(user.id, { joinedAt: new Date() });
      this.logger.log(`Join request approved for ${req.from.id}`);
      return;
    }
    await this.telegram.call('declineChatJoinRequest', params);
    const lang = user?.language ?? langFromCode(req.from.language_code);
    // user_chat_id lets the bot write first, even if they never started it.
    await this.send(req.user_chat_id ?? req.from.id, ACCESS_TEXTS[lang].notApproved, [[{ text: ACCESS_TEXTS[lang].getAccess, callback_data: 'acc:menu' }]]).catch(
      (err) => this.logger.warn(`Could not message declined user ${req.from.id}: ${err.message}`),
    );
  }

  async approve(userId: string) {
    const user = await this.get(userId);
    const link = await this.joinLink();
    Object.assign(user, { accessStatus: 'approved', decidedAt: new Date() });
    await this.users.save(user);
    await this.sendApproved(Number(user.id), user.language ?? 'en', undefined, link);
    return user;
  }

  async reject(userId: string) {
    const user = await this.get(userId);
    Object.assign(user, { accessStatus: 'rejected', decidedAt: new Date() });
    await this.users.save(user);
    const lang = user.language ?? 'en';
    const t = ACCESS_TEXTS[lang];
    const referralUrl = this.settings.get('access').referralUrl;
    const rows: any[][] = [];
    if (isUrl(referralUrl)) rows.push([{ text: t.register, url: referralUrl }]);
    rows.push([{ text: t.registered, callback_data: 'acc:reg' }]);
    await this.send(Number(user.id), t.rejected.replace('{id}', user.pocketId ?? ''), rows);
    return user;
  }

  /** Requests for the admin panel (everyone who entered the access flow), newest first. */
  async requests(status?: AccessStatus) {
    const where = status ? { accessStatus: status } : { accessStatus: Not('none' as AccessStatus) };
    const [items, counts] = await Promise.all([
      this.users.find({ where, order: { requestedAt: { direction: 'DESC', nulls: 'LAST' }, updatedAt: 'DESC' }, take: 200 }),
      this.users.createQueryBuilder('u').select('u.accessStatus', 'status').addSelect('COUNT(*)::int', 'count').groupBy('u.accessStatus').getRawMany(),
    ]);
    return { items, counts: Object.fromEntries(counts.map((c) => [c.status, c.count])) as Record<string, number> };
  }

  pendingCount() {
    return this.users.countBy({ accessStatus: 'pending' });
  }

  /** Creates a new join-request invite link for the channel (old links keep working until revoked in Telegram). */
  async createJoinLink() {
    const channelId = this.settings.get('telegram').channelId;
    if (!channelId) throw new Error('Set the signals channel in Admin → Telegram first');
    const link = await this.telegram.call('createChatInviteLink', { chat_id: channelId, name: 'MultiAI access', creates_join_request: true });
    await this.settings.update('access', { joinLink: link.invite_link });
    return link.invite_link as string;
  }

  private async joinLink() {
    return this.settings.get('access').joinLink || this.createJoinLink();
  }

  private async sendApproved(chatId: number, lang: Lang, editMessageId?: number, link?: string) {
    const url = link ?? (await this.joinLink());
    const t = ACCESS_TEXTS[lang];
    return this.send(chatId, t.approved, [[{ text: t.joinChannel, url }]], editMessageId);
  }

  private async notifyAdmins(user: BotUser) {
    const admins = parseAdminIds(this.settings.get('access').adminTelegramIds);
    if (!admins.length) this.logger.warn('Access request received but no admin Telegram IDs are set (Admin → Access)');
    const reply_markup = {
      inline_keyboard: [[{ text: '✅ Approve', callback_data: `adm:ok:${user.id}` }, { text: '❌ Reject', callback_data: `adm:no:${user.id}` }]],
    };
    for (const adminId of admins) {
      await callHtml(this.telegram, 'sendMessage', { chat_id: adminId, text: requestSummary(user), reply_markup }).catch((err) =>
        // Usually the admin hasn't pressed Start in the bot yet.
        this.logger.warn(`Could not notify admin ${adminId}: ${err.message}`),
      );
    }
  }

  private send(chatId: number | string, text: string, rows: any[][], editMessageId?: number) {
    const payload: Record<string, unknown> = { chat_id: chatId, text, reply_markup: { inline_keyboard: rows } };
    if (editMessageId) payload.message_id = editMessageId;
    return callHtml(this.telegram, editMessageId ? 'editMessageText' : 'sendMessage', payload);
  }

  private async get(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}

const backButton = (lang: Lang) => ({ text: ACCESS_TEXTS[lang].back, callback_data: 'acc:back' });

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function requestSummary(user: BotUser) {
  const who = `<b>${escapeHtml(user.firstName || 'User')}</b>${user.username ? ` @${escapeHtml(user.username)}` : ''} (id ${user.id})`;
  return `🆕 <b>Signals access request</b>\n${who}\nPocket Option ID: <code>${escapeHtml(user.pocketId ?? '—')}</code>\nLanguage: ${(user.language ?? '—').toUpperCase()}\n\nCheck the ID in your Pocket Option affiliate cabinet.`;
}
