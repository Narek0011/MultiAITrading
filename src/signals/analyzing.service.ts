import { Injectable } from '@nestjs/common';
import { PairsService } from '../pairs/pairs.service';
import { SettingsService } from '../settings/settings.service';
import { ChannelSender } from '../telegram/channel-sender.service';
import { analyzingText } from '../telegram/messages';
import { activeSignalChannels } from '../telegram/signal-channels';
import { ActivityLogService } from './activity-log.service';

/** The "AI is analyzing…" posts are on screen at least this long before they are deleted. */
const MIN_VISIBLE_MS = 45_000;

export interface AnalyzingPosts {
  at: number;
  posts: { chatId: string; messageId: number }[];
}

/** "AI is analyzing the market…" in every signal channel while a scheduled signal is being picked; removed afterwards. */
@Injectable()
export class AnalyzingService {
  constructor(
    private readonly settings: SettingsService,
    private readonly pairs: PairsService,
    private readonly sender: ChannelSender,
    private readonly log: ActivityLogService,
  ) {}

  /** Posts the message (when switched on). Never throws: a failed post must not stop the signal. */
  async start(): Promise<AnalyzingPosts> {
    const out: AnalyzingPosts = { at: Date.now(), posts: [] };
    const tg = this.settings.get('telegram');
    if (!tg.analyzingMessage) return out;
    const symbols = (await this.pairs.enabled().catch(() => [])).map((p) => p.symbol);
    for (const ch of activeSignalChannels(tg, this.settings.get('general').signalLanguage)) {
      try {
        out.posts.push({ chatId: ch.chatId, messageId: await this.sender.sendMessage(analyzingText(shuffle(symbols), ch.language), undefined, ch.chatId) });
      } catch (err: any) {
        this.log.add('warn', `"Analyzing" message to ${ch.name} failed: ${err.message}`);
      }
    }
    return out;
  }

  /** Deletes the messages, after they have been visible for a little while. */
  async finish(a: AnalyzingPosts) {
    if (!a.posts.length) return;
    const wait = MIN_VISIBLE_MS - (Date.now() - a.at);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    for (const p of a.posts) {
      await this.sender.deleteMessage(p.chatId, p.messageId).catch((err) => this.log.add('warn', `Could not delete the "analyzing" message in ${p.chatId}: ${err.message}`));
    }
  }
}

/** A different order each time so the message doesn't look canned. */
const shuffle = <T>(list: T[]) => list.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
