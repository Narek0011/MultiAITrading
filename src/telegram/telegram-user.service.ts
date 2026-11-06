import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { Logger as GramLogger, LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { SettingsService } from '../settings/settings.service';

/** A login waiting for the code Telegram sent to the phone. */
interface PendingLogin {
  client: TelegramClient;
  phone: string;
  phoneCodeHash: string;
}

/**
 * Posts as a Telegram user account (MTProto) instead of the bot. Bots can't send custom emoji
 * unless their username was bought on Fragment; a Premium user account can, in any channel it admins.
 */
@Injectable()
export class TelegramUserService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramUserService.name);
  private client: Promise<TelegramClient> | null = null;
  /** Settings the open client was built from; a change reconnects. */
  private clientKey = '';
  private pending: PendingLogin | null = null;
  private peers = new Map<string, Api.TypeInputPeer>();

  constructor(private readonly settings: SettingsService) {
    settings.events.on('changed', (group) => {
      if (group === 'telegram' && this.key() !== this.clientKey) void this.disconnect();
    });
  }

  async onModuleDestroy() {
    await this.disconnect();
    await this.pending?.client.disconnect().catch(() => undefined);
  }

  /** True when signals should go out from the user account. */
  get active() {
    const tg = this.settings.get('telegram');
    return tg.userPosting && !!tg.userSession && !!this.credentials();
  }

  status() {
    const tg = this.settings.get('telegram');
    return { configured: !!this.credentials(), loggedIn: !!tg.userSession, name: tg.userName, posting: tg.userPosting, waitingForCode: !!this.pending };
  }

  /** Step 1: Telegram sends a login code to the account (in the Telegram app). */
  async sendCode(phone: string) {
    const creds = this.requireCredentials();
    phone = phone.replace(/[^\d+]/g, '');
    if (!/^\+?\d{7,15}$/.test(phone)) throw new Error('Enter the phone number with country code, e.g. +37499123456');
    await this.pending?.client.disconnect().catch(() => undefined);
    const client = this.newClient('');
    await client.connect();
    const { phoneCodeHash } = await client.sendCode(creds, phone);
    this.pending = { client, phone, phoneCodeHash };
    return { sent: true };
  }

  /** Step 2: the code (and the 2-step verification password if the account has one). */
  async signIn(code: string, password?: string) {
    const p = this.pending;
    if (!p) throw new Error('Press "Send code" first');
    try {
      await p.client.invoke(new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.phoneCodeHash, phoneCode: code.replace(/\D/g, '') }));
    } catch (err: any) {
      if (err?.errorMessage !== 'SESSION_PASSWORD_NEEDED') throw new Error(authError(err));
      if (!password) throw new Error('This account has 2-step verification — enter its password too');
      await p.client.signInWithPassword(this.requireCredentials(), {
        password: async () => password,
        onError: (e) => {
          throw new Error(authError(e));
        },
      });
    }
    const me = (await p.client.getMe()) as Api.User;
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ') + (me.username ? ` (@${me.username})` : '') + (me.premium ? '' : ' — no Premium');
    const session = (p.client.session as StringSession).save();
    this.pending = null;
    await this.disconnect();
    await this.settings.update('telegram', { userSession: session, userName: name, userPosting: true });
    await p.client.disconnect().catch(() => undefined);
    return { name, premium: !!me.premium };
  }

  async logout() {
    if (this.settings.get('telegram').userSession) {
      const client = await this.connect().catch(() => null);
      await client?.invoke(new Api.auth.LogOut()).catch(() => undefined);
    }
    await this.disconnect();
    await this.settings.update('telegram', { userSession: '', userName: '', userPosting: false });
    return { loggedOut: true };
  }

  /** Same shape as the bot's sendPhoto: `caption` is Telegram HTML, `<tg-emoji>` included. Returns the message id. */
  async sendPhoto(photo: Buffer, caption: string, chatId: string, type: 'png' | 'jpeg' = 'png'): Promise<number> {
    const client = await this.connect();
    const name = type === 'png' ? 'signal.png' : 'signal.jpg';
    const msg = await client.sendFile(await this.peer(client, chatId), { file: new CustomFile(name, photo.length, '', photo), caption, parseMode: 'html', forceDocument: false });
    return msg.id;
  }

  async sendMessage(text: string, replyTo: number | undefined, chatId: string): Promise<number> {
    const client = await this.connect();
    const msg = await client.sendMessage(await this.peer(client, chatId), { message: text, parseMode: 'html', linkPreview: false, replyTo });
    return msg.id;
  }

  /** "@name" resolves directly; "-100…" ids must be in the account's dialogs, so those are loaded once. */
  private async peer(client: TelegramClient, chatId: string) {
    const hit = this.peers.get(chatId);
    if (hit) return hit;
    let peer: Api.TypeInputPeer;
    try {
      peer = await client.getInputEntity(chatId.startsWith('@') ? chatId : Number(chatId));
    } catch {
      await client.getDialogs({ limit: 500 });
      peer = await client.getInputEntity(chatId.startsWith('@') ? chatId : Number(chatId)).catch(() => {
        throw new Error(`The Telegram account can't see ${chatId} — it must be an admin of that channel`);
      });
    }
    this.peers.set(chatId, peer);
    return peer;
  }

  private connect(): Promise<TelegramClient> {
    this.client ??= this.open().catch((err) => {
      this.client = null;
      throw err;
    });
    return this.client;
  }

  private async open() {
    const { userSession } = this.settings.get('telegram');
    if (!userSession || !this.credentials()) throw new Error('Telegram account is not logged in (Admin → Telegram)');
    this.clientKey = this.key();
    const client = this.newClient(userSession);
    await client.connect();
    return client;
  }

  private async disconnect() {
    const c = this.client;
    this.client = null;
    this.peers.clear();
    if (c) await (await c.catch(() => null))?.disconnect().catch(() => undefined);
  }

  private newClient(session: string) {
    const { apiId, apiHash } = this.requireCredentials();
    return new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3, baseLogger: new GramLogger(LogLevel.ERROR) });
  }

  private key() {
    const tg = this.settings.get('telegram');
    return [tg.userApiId, tg.userApiHash, tg.userSession].join('|');
  }

  private credentials() {
    const tg = this.settings.get('telegram');
    const apiId = Number(tg.userApiId);
    return Number.isInteger(apiId) && apiId > 0 && /^[0-9a-f]{32}$/i.test(tg.userApiHash) ? { apiId, apiHash: tg.userApiHash } : null;
  }

  private requireCredentials() {
    const c = this.credentials();
    if (!c) throw new Error('Set the API ID and API hash from my.telegram.org first, then Save');
    return c;
  }
}

function authError(err: any): string {
  const code = String(err?.errorMessage ?? err?.message ?? err);
  if (/PHONE_CODE_INVALID/.test(code)) return 'Wrong code — check the code in your Telegram app';
  if (/PHONE_CODE_EXPIRED/.test(code)) return 'The code expired — press "Send code" again';
  if (/PASSWORD_HASH_INVALID/.test(code)) return 'Wrong 2-step verification password';
  return `Telegram: ${code}`;
}
