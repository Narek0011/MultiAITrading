import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeIndicators } from '../analysis/indicators';
import { ChartRendererService } from '../charts/chart-renderer.service';
import { NewsCardRendererService } from '../charts/news-card-renderer.service';
import { JobRunner } from '../common/jobs';
import { askOpenAi, contentAi } from '../common/openai';
import { Candle } from '../common/types';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { NewsChannel, NewsLang } from '../settings/settings.types';
import { ActivityLogService } from '../signals/activity-log.service';
import { TelegramService } from '../telegram/telegram.service';
import { newsChannels } from './news-channels';
import { formatPost, Mover, NEWS_LABELS, NewsReply, pickFormat, settleFormat } from './news-formats';
import { NewsPost } from './news-post.entity';
import { isValidTimeZone, NewsFormat, NewsFormatChoice, nextSlot, NewsType, parseSlots, zonedParts } from './news-schedule';
import { collectSources, parseSourceUrls } from './news-sources';
import { mergeTranslation, NEWS_SCHEMA, newsInput, newsInstructions, parseNewsReply, translateInstructions } from './news-writer';

const CAPTION_LIMIT = 1024;
/** Pairs whose 24h change makes up the "movers" post. Kept short: each one is a Twelve Data request. */
const MOVER_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF'];
const LOCALE: Record<NewsLang, string> = { en: 'en-GB', ru: 'ru-RU', es: 'es-ES', hy: 'hy-AM' };

/** Which channels get a post and how it should look. Empty channels = every enabled channel; no format = auto. */
export interface PublishOptions {
  format?: NewsFormatChoice;
  channels?: string[];
}

/** A researched post before it is rendered for a channel's language. */
interface Draft {
  type: NewsType;
  format: NewsFormat;
  reply: NewsReply;
  movers: Mover[];
  candles: Candle[] | null;
}

/** Post HTML → the plain text kept in the posts table. */
const plainText = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Writes trading-news posts with the AI and publishes them to the news channels. */
@Injectable()
export class NewsService {
  /** Admin Preview / Post now run in the background so the HTTP request never hits the proxy timeout. */
  private readonly jobs = new JobRunner();

  constructor(
    @InjectRepository(NewsPost) private readonly repo: Repository<NewsPost>,
    private readonly settings: SettingsService,
    private readonly market: TwelveDataService,
    private readonly charts: ChartRendererService,
    private readonly cards: NewsCardRendererService,
    private readonly telegram: TelegramService,
    private readonly log: ActivityLogService,
  ) {}

  /** Every configured channel (the legacy single channel until channels are added). */
  channels(): NewsChannel[] {
    return newsChannels(this.settings.get('news'));
  }

  /** Enabled channels, limited to `keys` when given. */
  targets(keys: string[] = []): NewsChannel[] {
    return this.channels().filter((c) => c.enabled && (!keys.length || keys.includes(c.key)));
  }

  private requireTargets(keys: string[] = []) {
    const list = this.targets(keys);
    if (!list.length) throw new Error('No news channel selected — add or enable one (Admin → News channel)');
    return list;
  }

  /** Researches and writes one post in `lang`. Nothing is published. `onNote` reports progress to the admin. */
  async generate(type: NewsType, choice: NewsFormatChoice, lang: NewsLang, onNote?: (note: string) => void): Promise<Draft> {
    const cfg = this.settings.get('news');
    const useWebSearch = cfg.sourceMode !== 'custom';
    const sources = cfg.sourceMode === 'ai' ? { text: '', errors: [] as string[] } : await collectSources(parseSourceUrls(cfg.sources));
    sources.errors.forEach((e) => this.log.add('warn', `News source failed — ${e}`));
    if (cfg.sourceMode === 'custom' && !sources.text) throw new Error('No news could be read from the custom sources (Admin → News channel)');

    // One post goes to several channels as several rows; count each (day, slot) once.
    const seen = new Set<string>();
    const recent = (await this.repo.find({ where: { status: 'posted' }, order: { createdAt: 'DESC' }, take: 20 }))
      .filter((p) => !seen.has(`${p.day}|${p.slot}`) && seen.add(`${p.day}|${p.slot}`))
      .slice(0, 5);

    let format = choice === 'auto' ? pickFormat(type, recent.map((p) => p.format ?? '')) : choice;
    let movers: Mover[] = [];
    if (format === 'movers') {
      onNote?.('reading the market movers');
      movers = await this.loadMovers();
      if (movers.length < 3) format = 'bullets';
    }

    const now = new Date();
    const tz = isValidTimeZone(cfg.timezone) ? cfg.timezone : 'UTC';
    const nowText = `${now.toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })} (${tz})`;
    const request: Record<string, unknown> = {
      model: this.model(),
      // Caps what the rate limiter reserves per request; enough for low-effort reasoning + a short post.
      max_output_tokens: 3000,
      instructions: newsInstructions(cfg, lang, format, useWebSearch),
      input: newsInput(type, nowText, recent.map((p) => p.text), sources.text, movers),
      text: { format: { type: 'json_schema', name: 'news_post', schema: NEWS_SCHEMA, strict: true } },
    };
    if (useWebSearch) request.tools = [{ type: 'web_search', search_context_size: 'low' }];
    onNote?.(`researching the news (${format})`);
    const reply = parseNewsReply(await this.ask(request, onNote));
    format = settleFormat(format, reply, movers);

    let candles: Candle[] | null = null;
    if (cfg.withChart && (format === 'story' || format === 'levels')) {
      onNote?.('making the chart');
      try {
        candles = await this.market.getCandles(reply.pair, '1h', 120);
      } catch (err: any) {
        this.log.add('warn', `News chart skipped (${reply.pair}): ${err.message}`);
      }
    }
    if (format === 'levels') reply.levels = this.checkLevels(reply, candles, lang);
    return { type, format, reply, movers, candles };
  }

  /** Telegram HTML + image for one language. Image problems never fail the post. */
  render(draft: Draft, reply: NewsReply, lang: NewsLang): { html: string; image: Buffer | null } {
    const html = formatPost(draft.format, reply, lang, draft.movers);
    if (!this.settings.get('news').withChart) return { html, image: null };
    try {
      return { html, image: this.image(draft, reply, lang) };
    } catch (err: any) {
      this.log.add('warn', `News image skipped (${draft.format}): ${err.message}`);
      return { html, image: null };
    }
  }

  private image(draft: Draft, reply: NewsReply, lang: NewsLang): Buffer | null {
    const labels = NEWS_LABELS[lang];
    const cfg = this.settings.get('news');
    const tz = isValidTimeZone(cfg.timezone) ? cfg.timezone : 'UTC';
    const date = new Date().toLocaleDateString(LOCALE[lang], { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long' });
    switch (draft.format) {
      case 'story':
      case 'levels': {
        if (!draft.candles) return null;
        const c = this.settings.get('custom');
        const indicators = computeIndicators(draft.candles, { ...c, atrPeriod: this.settings.get('risk').atrPeriod });
        const last = draft.candles[draft.candles.length - 1].close;
        const levels = draft.format === 'levels' ? shortLevelLabels(reply.levels, last) : undefined;
        return this.charts.renderPng({ pair: reply.pair, timeframe: '1h', candles: draft.candles, indicators, levels, emaLabels: [`EMA ${c.emaFast}`, `EMA ${c.emaSlow}`] });
      }
      case 'bullets':
        return this.cards.headlinePng({ kicker: labels.kicker[draft.type], headline: reply.headline || reply.bullets[0] || reply.text, date });
      case 'calendar':
        return this.cards.calendarPng({ title: labels.calendar, date, expectedLabel: labels.expected, events: reply.events });
      case 'movers':
        return this.cards.moversPng({ title: labels.movers, subtitle: labels.moversSub, movers: draft.movers });
      default:
        return null;
    }
  }

  /** Keeps AI levels that are near the real price; otherwise uses the real 24h and 5-day highs/lows. */
  private checkLevels(reply: NewsReply, candles: Candle[] | null, lang: NewsLang) {
    if (!candles?.length) return reply.levels;
    const last = candles[candles.length - 1].close;
    const near = reply.levels.filter((l) => Math.abs(l.price - last) / last < 0.03);
    if (near.length >= 2) return near.slice(0, 4);
    const day = candles.slice(-24);
    const { resistance, support } = NEWS_LABELS[lang];
    const levels = [
      { label: resistance, price: Math.max(...day.map((c) => c.high)) },
      { label: support, price: Math.min(...day.map((c) => c.low)) },
      { label: resistance, price: Math.max(...candles.map((c) => c.high)) },
      { label: support, price: Math.min(...candles.map((c) => c.low)) },
    ];
    return levels.filter((l, i) => levels.findIndex((o) => o.price === l.price) === i);
  }

  /** 24h change of the major pairs, from 1h candles. Pairs that fail are left out. */
  private async loadMovers(): Promise<Mover[]> {
    const movers: Mover[] = [];
    for (const pair of MOVER_PAIRS) {
      try {
        const candles = await this.market.getCandles(pair, '1h', 25);
        if (candles.length < 2) continue;
        const from = candles[0].close;
        movers.push({ pair, change: ((candles[candles.length - 1].close - from) / from) * 100 });
      } catch (err: any) {
        this.log.add('warn', `News movers: ${pair} skipped — ${err.message}`);
      }
    }
    return movers;
  }

  /** Same post in another language; numbers, pairs and codes are kept from the original. */
  private async translate(reply: NewsReply, lang: NewsLang, onNote?: (note: string) => void): Promise<NewsReply> {
    onNote?.(`translating (${lang})`);
    const request: Record<string, unknown> = {
      model: this.model(),
      max_output_tokens: 3000,
      instructions: translateInstructions(lang),
      input: JSON.stringify(reply),
      text: { format: { type: 'json_schema', name: 'news_post', schema: NEWS_SCHEMA, strict: true } },
    };
    return mergeTranslation(reply, parseNewsReply(await this.ask(request, onNote)));
  }

  private model() {
    return contentAi(this.settings).model;
  }

  private ask(request: Record<string, unknown>, onNote?: (note: string) => void) {
    return askOpenAi(contentAi(this.settings).client, request, onNote);
  }

  /**
   * Writes one post and publishes it to each target channel (translated to the channel's language).
   * Returns the post rows, or false if every channel already had this slot.
   */
  async publish(type: NewsType, day: string, slot: string, opts: PublishOptions = {}, onNote?: (note: string) => void): Promise<NewsPost[] | false> {
    // Claim the slot per channel first; the unique (day, slot, channel) index makes a second run fail here.
    const claimed: { channel: NewsChannel; post: NewsPost }[] = [];
    for (const channel of this.targets(opts.channels)) {
      try {
        claimed.push({ channel, post: await this.repo.save(this.repo.create({ day, slot, type, channel: channel.key, status: 'pending' })) });
      } catch {
        // already taken
      }
    }
    if (!claimed.length) return false;

    let draft: Draft;
    try {
      draft = await this.generate(type, opts.format ?? 'auto', claimed[0].channel.language, onNote);
    } catch (err: any) {
      this.log.add('error', `News post failed (${type}): ${err.message}`);
      for (const { post } of claimed) Object.assign(post, { status: 'failed', error: err.message });
      await this.repo.save(claimed.map((c) => c.post));
      return claimed.map((c) => c.post);
    }

    const replies = new Map<NewsLang, NewsReply>([[claimed[0].channel.language, draft.reply]]);
    for (const { channel, post } of claimed) {
      post.format = draft.format;
      post.pair = draft.reply.pair;
      try {
        let reply = replies.get(channel.language);
        if (!reply) replies.set(channel.language, (reply = await this.translate(draft.reply, channel.language, onNote)));
        const { html, image } = this.render(draft, reply, channel.language);
        onNote?.(`posting to ${channel.name}`);
        post.text = plainText(html);
        post.telegramMessageId = await this.send(html, image, channel.chatId);
        post.status = 'posted';
        this.log.add('success', `News posted to ${channel.name} (${type}, ${draft.format}, ${draft.reply.pair})`);
      } catch (err: any) {
        post.status = 'failed';
        post.error = err.message;
        this.log.add('error', `News post to ${channel.name} failed (${type}): ${err.message}`);
      }
      await this.repo.save(post);
    }
    return claimed.map((c) => c.post);
  }

  startPreview(type: NewsType, opts: PublishOptions) {
    return this.jobs.start((note) => this.preview(type, opts, note));
  }

  startPostNow(type: NewsType, opts: PublishOptions) {
    return this.jobs.start((note) => this.postNow(type, opts, note));
  }

  job(id: string) {
    return this.jobs.get(id);
  }

  /** Shows the post as the first selected channel would get it. */
  async preview(type: NewsType, opts: PublishOptions, onNote?: (note: string) => void) {
    const channel = this.requireTargets(opts.channels)[0];
    const draft = await this.generate(type, opts.format ?? 'auto', channel.language, onNote);
    const { html, image } = this.render(draft, draft.reply, channel.language);
    return { format: draft.format, pair: draft.reply.pair, channel: channel.name, html, image: image ? `data:image/png;base64,${image.toString('base64')}` : null };
  }

  /** "Post now" from the admin: its own slot key so it never blocks the schedule. */
  async postNow(type: NewsType, opts: PublishOptions, onNote?: (note: string) => void) {
    this.requireTargets(opts.channels);
    const cfg = this.settings.get('news');
    const now = new Date();
    const { day } = zonedParts(now, cfg.timezone);
    const posts = await this.publish(type, day, `now-${now.toISOString().slice(11, 19)}`, opts, onNote);
    if (!posts) throw new Error('A post is already being published, try again in a moment');
    const failed = posts.filter((p) => p.status === 'failed');
    if (failed.length === posts.length) throw new Error(failed[0].error ?? 'Post failed');
    return { posted: posts.length - failed.length, failed: failed.map((p) => `${p.channel}: ${p.error}`) };
  }

  async test(key?: string) {
    const channel = this.channels().find((c) => c.key === key) ?? this.requireTargets()[0];
    const id = await this.telegram.sendMessage('✅ MultiAI news is connected to this channel.', undefined, channel.chatId);
    return { channel: channel.name, messageId: id };
  }

  async overview() {
    const cfg = this.settings.get('news');
    const now = new Date();
    const { day } = zonedParts(now, cfg.timezone);
    const [posts, today] = await Promise.all([
      this.repo.find({ order: { createdAt: 'DESC' }, take: 30 }),
      this.repo.count({ where: { day, status: 'posted' } }),
    ]);
    const next = nextSlot(now, cfg.timezone, parseSlots(cfg.slots));
    return { enabled: cfg.enabled, today, next, posts, channels: this.channels() };
  }

  /** "HH:MM|channelKey" of every post row today. */
  async postedSlots(day: string) {
    const rows = await this.repo.find({ where: { day }, select: { slot: true, channel: true } });
    return new Set(rows.map((r) => `${r.slot}|${r.channel}`));
  }

  private async send(html: string, image: Buffer | null, chatId: string) {
    if (!image) return this.telegram.sendMessage(html, undefined, chatId);
    if (html.length <= CAPTION_LIMIT) return this.telegram.sendPhoto(image, html, chatId);
    // Too long for a caption: image first, then the text as a reply to it.
    const photoId = await this.telegram.sendPhoto(image, '', chatId);
    return this.telegram.sendMessage(html, photoId, chatId);
  }
}

/** Chart tags are small: R1/R2 above the price (nearest first), S1/S2 below. */
export function shortLevelLabels(levels: { price: number }[], last: number) {
  const above = levels.filter((l) => l.price >= last).sort((a, b) => a.price - b.price);
  const below = levels.filter((l) => l.price < last).sort((a, b) => b.price - a.price);
  return [...above.map((l, i) => ({ label: `R${i + 1}`, price: l.price })), ...below.map((l, i) => ({ label: `S${i + 1}`, price: l.price }))];
}
