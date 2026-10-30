import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NewsLang } from '../settings/settings.types';
import { NewsReply } from './news-formats';
import { NewsFormat } from './news-schedule';

/** Exactly what one channel will receive: the previewed HTML and image. */
export interface DraftChannel {
  key: string;
  name: string;
  chatId: string;
  language: NewsLang;
  html: string;
  image: Buffer | null;
}

/** A post that was previewed and is waiting for "Publish"; publishing sends it unchanged. */
export interface NewsDraft {
  id: string;
  createdAt: number;
  /** morning / midday / evening for AI posts, "custom" for the admin's own text. */
  type: string;
  format: NewsFormat;
  pair: string | null;
  channels: DraftChannel[];
}

const DRAFT_TTL_MS = 30 * 60_000;

/** Previewed drafts, in memory for 30 minutes. A draft can be published once. */
export class DraftStore {
  private readonly drafts = new Map<string, NewsDraft>();

  put(d: Omit<NewsDraft, 'id' | 'createdAt'>, now = Date.now()): NewsDraft {
    for (const [id, x] of this.drafts) if (now - x.createdAt > DRAFT_TTL_MS) this.drafts.delete(id);
    const draft = { ...d, id: randomUUID(), createdAt: now };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  /** Removes and returns the draft; a second publish of the same preview fails. */
  take(id: string, now = Date.now()): NewsDraft {
    const d = this.drafts.get(id);
    this.drafts.delete(id);
    if (!d || now - d.createdAt > DRAFT_TTL_MS) throw new NotFoundException('This preview expired or was already published — preview it again');
    return d;
  }
}

export type CustomStyle = 'plain' | 'headline' | 'points' | 'quick';
export const CUSTOM_STYLES: CustomStyle[] = ['plain', 'headline', 'points', 'quick'];

/** The admin's own text as a structured post, so it goes through the same formatting as AI posts. */
export function buildCustomReply(input: { headline?: string; text: string; style: CustomStyle; pair?: string | null }): { format: NewsFormat; reply: NewsReply } {
  const text = input.text.replace(/\r\n?/g, '\n').trim();
  const headline = (input.headline ?? '').trim();
  const base: NewsReply = { headline: '', text, bullets: [], pair: input.pair || 'EUR/USD', levels: [], events: [] };
  switch (input.style) {
    case 'headline':
      return { format: 'story', reply: { ...base, headline } };
    case 'points': {
      const bullets = text.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
      return { format: 'bullets', reply: { ...base, headline, bullets, text: '' } };
    }
    case 'quick':
      return { format: 'quick', reply: base };
    default:
      return { format: 'story', reply: base };
  }
}
