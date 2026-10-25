import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { computeIndicators } from '../analysis/indicators';
import { ChartRendererService } from '../charts/chart-renderer.service';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { ActivityLogService } from '../signals/activity-log.service';
import { TelegramService } from '../telegram/telegram.service';
import { NewsPost } from './news-post.entity';
import { isValidTimeZone, nextSlot, NewsType, parseSlots, zonedParts } from './news-schedule';
import { collectSources, parseSourceUrls } from './news-sources';
import { NEWS_SCHEMA, newsInput, newsInstructions, parseNewsReply } from './news-writer';

const CAPTION_LIMIT = 1024;
const JOB_TTL_MS = 10 * 60_000;

/** Admin Preview / Post now run in the background so the HTTP request never hits the proxy timeout. */
interface NewsJobState {
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  result?: unknown;
  error?: string;
}
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Writes trading-news posts with the AI and publishes them to the news channel. */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly jobs = new Map<string, NewsJobState>();

  constructor(
    @InjectRepository(NewsPost) private readonly repo: Repository<NewsPost>,
    private readonly settings: SettingsService,
    private readonly market: TwelveDataService,
    private readonly charts: ChartRendererService,
    private readonly telegram: TelegramService,
    private readonly log: ActivityLogService,
  ) {}

  /** Researches and writes one post (+ chart). Nothing is published. */
  async generate(type: NewsType) {
    const cfg = this.settings.get('news');
    const useWebSearch = cfg.sourceMode !== 'custom';
    const sources = cfg.sourceMode === 'ai' ? { text: '', errors: [] as string[] } : await collectSources(parseSourceUrls(cfg.sources));
    sources.errors.forEach((e) => this.log.add('warn', `News source failed — ${e}`));
    if (cfg.sourceMode === 'custom' && !sources.text) throw new Error('No news could be read from the custom sources (Admin → News channel)');

    const recent = (await this.repo.find({ where: { status: 'posted' }, order: { createdAt: 'DESC' }, take: 5 })).map((p) => p.text);
    const now = new Date();
    const tz = isValidTimeZone(cfg.timezone) ? cfg.timezone : 'UTC';
    const nowText = `${now.toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })} (${tz})`;
    const request: Record<string, unknown> = {
      model: this.settings.get('ai').model,
      instructions: newsInstructions(cfg, useWebSearch),
      input: newsInput(type, nowText, recent, sources.text),
      text: { format: { type: 'json_schema', name: 'news_post', schema: NEWS_SCHEMA, strict: true } },
    };
    if (useWebSearch) request.tools = [{ type: 'web_search', search_context_size: 'low' }];
    // Reasoning models think for a long time by default; a news post doesn't need that.
    if (/^(gpt-5|o\d)/.test(String(request.model))) request.reasoning = { effort: 'low' };
    const res = await this.openai().responses.create(request as any);
    const { text, pair } = parseNewsReply((res as any).output_text ?? '');

    let chart: Buffer | null = null;
    if (cfg.withChart) {
      try {
        const c = this.settings.get('custom');
        const candles = await this.market.getCandles(pair, '1h', 120);
        const indicators = computeIndicators(candles, { ...c, atrPeriod: this.settings.get('risk').atrPeriod });
        chart = this.charts.renderPng({ pair, timeframe: '1h', candles, indicators, emaLabels: [`EMA ${c.emaFast}`, `EMA ${c.emaSlow}`] });
      } catch (err: any) {
        this.log.add('warn', `News chart skipped (${pair}): ${err.message}`);
      }
    }
    return { text, pair, chart };
  }

  /** Generates and publishes the post for one slot. Returns false if the slot was already taken. */
  async publish(type: NewsType, day: string, slot: string) {
    // Claim the slot first; the unique (day, slot) index makes a second run fail here.
    let post: NewsPost;
    try {
      post = await this.repo.save(this.repo.create({ day, slot, type, status: 'pending' }));
    } catch {
      return false;
    }
    try {
      const { text, pair, chart } = await this.generate(type);
      post.text = text;
      post.pair = pair;
      post.telegramMessageId = await this.send(text, chart);
      post.status = 'posted';
      this.log.add('success', `News posted (${type}, ${pair})`);
    } catch (err: any) {
      post.status = 'failed';
      post.error = err.message;
      this.log.add('error', `News post failed (${type}): ${err.message}`);
    }
    await this.repo.save(post);
    return post;
  }

  startPreview(type: NewsType) {
    return this.startJob(() => this.preview(type));
  }

  startPostNow(type: NewsType) {
    return this.startJob(() => this.postNow(type));
  }

  job(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('This job has expired — please try again');
    return { ...job, seconds: Math.round((Date.now() - job.startedAt) / 1000) };
  }

  private startJob(run: () => Promise<unknown>) {
    const now = Date.now();
    for (const [id, j] of this.jobs) if (now - j.startedAt > JOB_TTL_MS) this.jobs.delete(id);
    const id = randomUUID();
    const job: NewsJobState = { status: 'running', startedAt: now };
    this.jobs.set(id, job);
    run().then(
      (result) => Object.assign(job, { status: 'done', result }),
      (err: any) => Object.assign(job, { status: 'failed', error: err?.message ?? String(err) }),
    );
    return { jobId: id };
  }

  async preview(type: NewsType) {
    const { text, pair, chart } = await this.generate(type);
    return { text, pair, chart: chart ? `data:image/png;base64,${chart.toString('base64')}` : null };
  }

  /** "Post now" from the admin: its own slot key so it never blocks the schedule. */
  async postNow(type: NewsType) {
    const cfg = this.settings.get('news');
    const now = new Date();
    const { day } = zonedParts(now, cfg.timezone);
    const post = await this.publish(type, day, `now-${now.toISOString().slice(11, 19)}`);
    if (!post) throw new Error('A post is already being published, try again in a moment');
    if (post.status === 'failed') throw new Error(post.error ?? 'Post failed');
    return { post };
  }

  async test() {
    const id = await this.telegram.sendMessage('✅ MultiAI news is connected to this channel.', undefined, this.channel());
    return { channel: this.channel(), messageId: id };
  }

  async overview() {
    const cfg = this.settings.get('news');
    const now = new Date();
    const { day } = zonedParts(now, cfg.timezone);
    const [posts, today] = await Promise.all([
      this.repo.find({ order: { createdAt: 'DESC' }, take: 20 }),
      this.repo.count({ where: { day, status: 'posted' } }),
    ]);
    const next = nextSlot(now, cfg.timezone, parseSlots(cfg.slots));
    return { enabled: cfg.enabled, today, next, posts };
  }

  async postedSlots(day: string) {
    const rows = await this.repo.find({ where: { day }, select: { slot: true } });
    return new Set(rows.map((r) => r.slot));
  }

  /** The news page's own key if set, otherwise the one from AI settings. Web search can be slow, so allow 3 min. */
  private openai() {
    const apiKey = this.settings.get('news').apiKey.trim() || this.settings.get('ai').apiKey;
    if (!apiKey) throw new Error('OpenAI API key is not set (Admin → News channel or AI settings)');
    return new OpenAI({ apiKey, timeout: 180_000 });
  }

  private channel() {
    const id = this.settings.get('news').channelId.trim();
    if (!id) throw new Error('News channel is not set (Admin → News channel)');
    return id;
  }

  private async send(text: string, chart: Buffer | null) {
    const chatId = this.channel();
    const html = escapeHtml(text);
    if (!chart) return this.telegram.sendMessage(html, undefined, chatId);
    if (html.length <= CAPTION_LIMIT) return this.telegram.sendPhoto(chart, html, chatId);
    // Too long for a caption: chart first, then the text as a reply to it.
    const photoId = await this.telegram.sendPhoto(chart, '', chatId);
    return this.telegram.sendMessage(html, photoId, chatId);
  }
}
