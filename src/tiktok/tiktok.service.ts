import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { Repository } from 'typeorm';
import { computeIndicators } from '../analysis/indicators';
import { ChartRendererService } from '../charts/chart-renderer.service';
import { toPostJpeg } from '../charts/raster';
import { SocialCardRendererService, SocialSlide } from '../charts/social-card-renderer.service';
import { JobRunner } from '../common/jobs';
import { askOpenAi, contentAi, parseJsonReply } from '../common/openai';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { SettingsService } from '../settings/settings.service';
import { Lang } from '../settings/settings.types';
import { ActivityLogService } from '../signals/activity-log.service';
import { TikTokMedia, TikTokPost } from './tiktok-post.entity';
import { CAPTION_MAX, IDEAS_SCHEMA, ideasPrompt, ONE_SLIDE_SCHEMA, parseIdeas, parsePost, parseSlide, POST_SCHEMA, postPrompt, slidePrompt, TikTokTopic, TITLE_MAX } from './tiktok-writer';
import { CreatorInfo, Privacy, TikTokClient } from './tiktok.client';

export const TIKTOK_DIR = join(process.cwd(), 'storage', 'tiktok');
const LANGS: Lang[] = ['en', 'ru', 'es'];
const STATE_TTL_MS = 10 * 60_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_IMAGES = 35;
/** How long publish waits for TikTok to finish processing before leaving it as "processing". */
const STATUS_WAIT_MS = 5 * 60_000;

/** Fields the post form can change. */
export interface TikTokDraftPatch {
  contentType?: string;
  postMode?: string;
  source?: string;
  language?: string;
  title?: string;
  caption?: string;
  privacy?: string;
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  brandContent?: boolean;
  brandOrganic?: boolean;
}

export interface UploadedFile {
  path: string;
  mimetype: string;
  size: number;
  originalname: string;
}

const publicUrl = () => (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');

/** Makes TikTok posts (by hand or with AI) and publishes them through the Content Posting API. */
@Injectable()
export class TikTokService {
  private readonly jobs = new JobRunner();
  /** OAuth `state` values handed out by Connect, so the callback can trust the redirect without the admin cookie. */
  private readonly states = new Map<string, number>();

  constructor(
    @InjectRepository(TikTokPost) private readonly repo: Repository<TikTokPost>,
    private readonly settings: SettingsService,
    private readonly cards: SocialCardRendererService,
    private readonly charts: ChartRendererService,
    private readonly market: TwelveDataService,
    private readonly log: ActivityLogService,
  ) {}

  // ---------- connection ----------

  redirectUri() {
    return `${publicUrl()}/admin/tiktok/callback`;
  }

  private client() {
    const { clientKey, clientSecret } = this.settings.get('tiktok');
    if (!clientKey.trim() || !clientSecret.trim()) throw new BadRequestException('Add the TikTok client key and secret first (Admin → TikTok)');
    return new TikTokClient(clientKey.trim(), clientSecret.trim());
  }

  connectUrl() {
    const state = randomBytes(18).toString('hex');
    const now = Date.now();
    for (const [s, t] of this.states) if (now - t > STATE_TTL_MS) this.states.delete(s);
    this.states.set(state, now);
    return this.client().authUrl(this.redirectUri(), state);
  }

  async finishConnect(code: string, state: string) {
    const issued = this.states.get(state);
    this.states.delete(state);
    if (!issued || Date.now() - issued > STATE_TTL_MS) throw new Error('This connect link expired — press "Connect TikTok" again');
    const client = this.client();
    const tokens = await client.exchangeCode(code, this.redirectUri());
    const user = await client.userInfo(tokens.accessToken).catch(() => ({ displayName: '', avatarUrl: '' }));
    await this.settings.update('tiktok', { ...tokens, ...user });
    this.log.add('success', `TikTok connected${user.displayName ? ` (${user.displayName})` : ''}`);
    return user;
  }

  async disconnect() {
    await this.settings.update('tiktok', { accessToken: '', refreshToken: '', tokenExpiresAt: 0, refreshExpiresAt: 0, openId: '', displayName: '', avatarUrl: '' });
  }

  /** A valid access token, refreshed when it has less than an hour left. */
  private async token() {
    const t = this.settings.get('tiktok');
    if (!t.accessToken) throw new Error('TikTok is not connected — press "Connect TikTok" (Admin → TikTok)');
    if (t.tokenExpiresAt - Date.now() > 3_600_000) return t.accessToken;
    if (!t.refreshToken || t.refreshExpiresAt < Date.now()) throw new Error('The TikTok connection expired — press "Connect TikTok" again');
    const fresh = await this.client().refresh(t.refreshToken);
    await this.settings.update('tiktok', fresh);
    return fresh.accessToken;
  }

  async creatorInfo(): Promise<CreatorInfo> {
    return this.client().creatorInfo(await this.token());
  }

  async overview() {
    const t = this.settings.get('tiktok');
    const connected = !!t.accessToken && t.refreshExpiresAt > Date.now();
    let creator: CreatorInfo | null = null;
    let creatorError: string | null = null;
    if (connected) {
      try {
        creator = await this.creatorInfo();
      } catch (err: any) {
        creatorError = err.message;
      }
    }
    const posts = await this.repo.find({ order: { createdAt: 'DESC' }, take: 30 });
    return {
      configured: !!(t.clientKey && t.clientSecret),
      connected,
      account: { displayName: t.displayName, avatarUrl: t.avatarUrl },
      creator,
      creatorError,
      redirectUri: this.redirectUri(),
      publicUrl: publicUrl(),
      posts: posts.map((p) => this.view(p)),
    };
  }

  // ---------- drafts ----------

  /** A post as the admin page sees it, with media URLs. */
  view(p: TikTokPost) {
    return { ...p, media: p.media.map((m) => ({ ...m, url: `/media/tiktok/${p.mediaKey}/${m.file}` })) };
  }

  async get(id: number) {
    const post = await this.repo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(patch: TikTokDraftPatch) {
    const post = this.repo.create({ mediaKey: randomUUID(), contentType: 'photo', language: this.settings.get('tiktok').language, media: [], slides: [] });
    this.apply(post, patch);
    return this.view(await this.repo.save(post));
  }

  async update(id: number, patch: TikTokDraftPatch) {
    const post = await this.get(id);
    this.editable(post);
    this.apply(post, patch);
    return this.view(await this.repo.save(post));
  }

  private apply(post: TikTokPost, p: TikTokDraftPatch) {
    if (p.contentType === 'video' || p.contentType === 'photo') post.contentType = p.contentType;
    if (p.postMode === 'direct' || p.postMode === 'draft') post.postMode = p.postMode;
    if (p.source === 'manual' || p.source === 'ai') post.source = p.source;
    if (LANGS.includes(p.language as Lang)) post.language = p.language!;
    if (typeof p.title === 'string') post.title = p.title.trim().slice(0, TITLE_MAX);
    if (typeof p.caption === 'string') post.caption = p.caption.trim().slice(0, CAPTION_MAX);
    if (typeof p.privacy === 'string') post.privacy = p.privacy;
    for (const k of ['allowComments', 'allowDuet', 'allowStitch', 'brandContent', 'brandOrganic'] as const) if (typeof p[k] === 'boolean') post[k] = p[k]!;
  }

  private editable(post: TikTokPost) {
    if (['publishing', 'published', 'in_inbox', 'processing'].includes(post.status)) throw new BadRequestException('This post was already sent to TikTok — duplicate it to make changes');
  }

  async remove(id: number) {
    const post = await this.get(id);
    await fs.rm(join(TIKTOK_DIR, post.mediaKey), { recursive: true, force: true });
    await this.repo.delete(id);
  }

  /** New draft with the same text and media, to post again or change something. */
  async duplicate(id: number) {
    const src = await this.get(id);
    const copy = this.repo.create({ ...src, id: undefined, mediaKey: randomUUID(), status: 'draft', publishId: null, error: null, postedAt: null, createdAt: undefined, updatedAt: undefined });
    await fs.mkdir(join(TIKTOK_DIR, copy.mediaKey), { recursive: true });
    for (const m of src.media) await fs.copyFile(join(TIKTOK_DIR, src.mediaKey, m.file), join(TIKTOK_DIR, copy.mediaKey, m.file)).catch(() => undefined);
    return this.view(await this.repo.save(copy));
  }

  // ---------- media ----------

  /** Adds uploaded files: images become ≤1080×1920 JPEGs, a video replaces any previous one. */
  async addMedia(id: number, files: UploadedFile[]) {
    const post = await this.get(id);
    this.editable(post);
    const dir = join(TIKTOK_DIR, post.mediaKey);
    await fs.mkdir(dir, { recursive: true });
    try {
      for (const f of files) {
        if (VIDEO_TYPES.includes(f.mimetype)) {
          for (const m of post.media) await fs.rm(join(dir, m.file), { force: true });
          const file = `video-${Date.now().toString(36)}${extname(f.originalname).toLowerCase() || '.mp4'}`;
          await fs.copyFile(f.path, join(dir, file));
          post.media = [{ file, kind: 'video', mime: f.mimetype, size: f.size }];
          post.contentType = 'video';
        } else if (IMAGE_TYPES.includes(f.mimetype)) {
          if (post.contentType === 'video') {
            for (const m of post.media) await fs.rm(join(dir, m.file), { force: true });
            post.media = [];
            post.contentType = 'photo';
          }
          if (post.media.length >= MAX_IMAGES) throw new BadRequestException(`TikTok allows up to ${MAX_IMAGES} images per post`);
          const jpeg = toPostJpeg(await fs.readFile(f.path), f.mimetype);
          const file = `img-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.jpg`;
          await fs.writeFile(join(dir, file), jpeg);
          post.media.push({ file, kind: 'image', mime: 'image/jpeg', size: jpeg.length });
        } else {
          throw new BadRequestException(`${f.originalname}: use JPG, PNG or WebP images, or an MP4/MOV/WebM video`);
        }
      }
    } finally {
      await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
    }
    return this.view(await this.repo.save(post));
  }

  async removeMedia(id: number, file: string) {
    const post = await this.get(id);
    this.editable(post);
    const m = post.media.find((x) => x.file === file);
    if (!m) throw new NotFoundException('File not found');
    await fs.rm(join(TIKTOK_DIR, post.mediaKey, m.file), { force: true });
    post.media = post.media.filter((x) => x !== m);
    return this.view(await this.repo.save(post));
  }

  async reorderMedia(id: number, files: string[]) {
    const post = await this.get(id);
    this.editable(post);
    const byName = new Map(post.media.map((m) => [m.file, m]));
    const ordered = files.map((f) => byName.get(f)).filter((m): m is TikTokMedia => !!m);
    post.media = [...ordered, ...post.media.filter((m) => !files.includes(m.file))];
    return this.view(await this.repo.save(post));
  }

  // ---------- AI ----------

  private async recentTitles() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' }, take: 8, select: { title: true, caption: true } });
    return rows.map((r) => r.title || r.caption.split('\n')[0]).filter(Boolean);
  }

  private async askJson(prompt: { instructions: string; input: string }, schema: object, name: string, onNote?: (n: string) => void, webSearch = false) {
    const { client, model } = contentAi(this.settings);
    const request: Record<string, unknown> = {
      model,
      max_output_tokens: 6000,
      instructions: prompt.instructions,
      input: prompt.input,
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    };
    if (webSearch) request.tools = [{ type: 'web_search', search_context_size: 'low' }];
    return parseJsonReply(await askOpenAi(client, request, onNote));
  }

  startIdeas(topic: TikTokTopic, lang: Lang) {
    return this.jobs.start(async (note) => {
      note('thinking of ideas');
      const data = await this.askJson(ideasPrompt(topic, lang, await this.recentTitles()), IDEAS_SCHEMA, 'tiktok_ideas', note, topic === 'market');
      return { ideas: parseIdeas(data) };
    });
  }

  /** AI writes the title + caption, and for photo posts designs and renders the slides (replacing earlier AI slides). */
  startGenerate(id: number, idea: string) {
    return this.jobs.start(async (note) => {
      const post = await this.get(id);
      this.editable(post);
      if (!idea.trim()) throw new BadRequestException('Type or pick an idea first');
      const type = post.contentType === 'video' ? 'video' : 'photo';
      note('writing the post');
      const data = await this.askJson(postPrompt(idea.trim(), post.language as Lang, type, await this.recentTitles()), POST_SCHEMA, 'tiktok_post', note);
      const result = parsePost(data, type);
      post.title = result.title;
      post.caption = result.caption;
      post.source = 'ai';
      if (type === 'photo') {
        note('drawing the slides');
        await this.renderSlides(post, result.slides);
      }
      return this.view(await this.repo.save(post));
    });
  }

  startRegenerateSlide(id: number, index: number) {
    return this.jobs.start(async (note) => {
      const post = await this.get(id);
      this.editable(post);
      if (!post.slides[index]) throw new BadRequestException('That slide no longer exists');
      note('rewriting the slide');
      const data = await this.askJson(slidePrompt(post, index, post.language as Lang), ONE_SLIDE_SCHEMA, 'tiktok_slide', note);
      const slides = [...post.slides];
      slides[index] = { ...parseSlide(data.slide), kind: post.slides[index].kind };
      note('drawing the slides');
      await this.renderSlides(post, slides);
      return this.view(await this.repo.save(post));
    });
  }

  /** Renders slides to JPEGs; earlier AI slide images are replaced, uploaded images are kept after them. */
  private async renderSlides(post: TikTokPost, slides: SocialSlide[]) {
    const dir = join(TIKTOK_DIR, post.mediaKey);
    await fs.mkdir(dir, { recursive: true });
    const old = post.media.filter((m) => m.file.startsWith('slide-'));
    for (const m of old) await fs.rm(join(dir, m.file), { force: true });
    const site = publicUrl().replace(/^https?:\/\//, '');
    const stamp = Date.now().toString(36);
    const media: TikTokMedia[] = [];
    for (let i = 0; i < slides.length; i++) {
      const chartPng = slides[i].kind === 'chart' ? await this.chartFor(slides[i].pair) : null;
      const jpeg = this.cards.renderJpeg(slides[i], i, slides.length, { chartPng, site: site && !/localhost|127\.0\.0\.1/.test(site) ? site : '' });
      const file = `slide-${stamp}-${String(i + 1).padStart(2, '0')}.jpg`;
      await fs.writeFile(join(dir, file), jpeg);
      media.push({ file, kind: 'image', mime: 'image/jpeg', size: jpeg.length });
    }
    post.slides = slides;
    post.media = [...media, ...post.media.filter((m) => m.kind === 'image' && !m.file.startsWith('slide-'))];
    post.contentType = 'photo';
  }

  private async chartFor(pair: string) {
    try {
      const candles = await this.market.getCandles(pair || 'EUR/USD', '1h', 120);
      const c = this.settings.get('custom');
      const indicators = computeIndicators(candles, { ...c, atrPeriod: this.settings.get('risk').atrPeriod });
      return this.charts.renderPng({ pair: pair || 'EUR/USD', timeframe: '1h', candles, indicators, emaLabels: [`EMA ${c.emaFast}`, `EMA ${c.emaSlow}`] });
    } catch (err: any) {
      this.log.add('warn', `TikTok slide chart skipped (${pair}): ${err.message}`);
      return null;
    }
  }

  // ---------- publishing ----------

  startPublish(id: number) {
    return this.jobs.start((note) => this.publish(id, note));
  }

  job(id: string) {
    return this.jobs.get(id);
  }

  /** Checks a post can be sent; returns the reason it can't, or null. */
  problem(post: TikTokPost, creator: CreatorInfo | null): string | null {
    const images = post.media.filter((m) => m.kind === 'image');
    const video = post.media.find((m) => m.kind === 'video');
    if (post.contentType === 'video' && !video) return 'Upload a video first';
    if (post.contentType === 'photo' && !images.length) return 'Add at least one image (upload, or generate slides with AI)';
    if (post.contentType === 'photo' && !/^https:\/\//.test(publicUrl())) return 'Photo posts need the site on a public https address (PUBLIC_URL), so TikTok can download the images';
    if (post.postMode === 'direct') {
      if (!post.privacy) return 'Choose who can see the post';
      if (creator && !creator.privacyOptions.includes(post.privacy as Privacy)) return 'That privacy level is not allowed for this account — pick one from the list';
      if (post.brandContent && post.privacy === 'SELF_ONLY') return 'Branded content cannot be private — choose another privacy level or turn off "Branded content"';
    }
    if (post.contentType === 'video' && !post.caption.trim()) return 'Write a caption';
    if (post.contentType === 'photo' && !post.title.trim()) return 'Write a title';
    return null;
  }

  async publish(id: number, onNote?: (n: string) => void) {
    const post = await this.get(id);
    this.editable(post);
    const client = this.client();
    onNote?.('checking the TikTok account');
    const token = await this.token();
    const creator = post.postMode === 'direct' ? await client.creatorInfo(token) : null;
    const problem = this.problem(post, creator);
    if (problem) throw new BadRequestException(problem);

    post.status = 'publishing';
    post.error = null;
    await this.repo.save(post);
    try {
      const info = {
        title: post.contentType === 'video' ? post.caption : post.title,
        description: post.caption,
        privacy: post.privacy as Privacy,
        allowComments: post.allowComments && !creator?.commentDisabled,
        allowDuet: post.allowDuet && !creator?.duetDisabled,
        allowStitch: post.allowStitch && !creator?.stitchDisabled,
        brandContent: post.brandContent,
        brandOrganic: post.brandOrganic,
      };
      const mode = post.postMode === 'draft' ? 'draft' : 'direct';
      if (post.contentType === 'video') {
        const video = post.media.find((m) => m.kind === 'video')!;
        const path = join(TIKTOK_DIR, post.mediaKey, video.file);
        const { size } = await fs.stat(path);
        onNote?.('starting the upload');
        const { publishId, uploadUrl } = await client.initVideo(token, mode, size, info);
        post.publishId = publishId;
        const fh = await fs.open(path, 'r');
        try {
          await client.uploadVideo(uploadUrl, size, video.mime, async (start, length) => {
            const buf = Buffer.alloc(length);
            await fh.read(buf, 0, length, start);
            return buf;
          }, (i, total) => onNote?.(`uploading the video (${i}/${total})`));
        } finally {
          await fh.close();
        }
      } else {
        const urls = post.media.filter((m) => m.kind === 'image').map((m) => `${publicUrl()}/media/tiktok/${post.mediaKey}/${m.file}`);
        onNote?.('sending the images');
        post.publishId = (await client.initPhotos(token, mode, urls, info)).publishId;
      }
      await this.repo.save(post);
      await this.waitForStatus(post, token, onNote);
    } catch (err: any) {
      post.status = 'failed';
      post.error = err.message;
      this.log.add('error', `TikTok post #${post.id} failed: ${err.message}`);
    }
    await this.repo.save(post);
    if (post.status === 'failed') throw new Error(post.error ?? 'TikTok post failed');
    return this.view(post);
  }

  private async waitForStatus(post: TikTokPost, token: string, onNote?: (n: string) => void) {
    const started = Date.now();
    while (Date.now() - started < STATUS_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 5000));
      if (this.applyStatus(post, await this.client().status(token, post.publishId!))) return;
      onNote?.(`TikTok is processing the post (${Math.round((Date.now() - started) / 1000)}s)`);
    }
    post.status = 'processing';
  }

  /** Copies TikTok's status onto the post; true when it is final. */
  private applyStatus(post: TikTokPost, s: { status: string; failReason: string }) {
    if (s.status === 'PUBLISH_COMPLETE') {
      post.status = 'published';
      post.postedAt = new Date();
      this.log.add('success', `TikTok post #${post.id} published`);
      return true;
    }
    if (s.status === 'SEND_TO_USER_INBOX') {
      post.status = 'in_inbox';
      post.postedAt = new Date();
      this.log.add('success', `TikTok post #${post.id} sent to the TikTok inbox — finish it in the app`);
      return true;
    }
    if (s.status === 'FAILED') throw new Error(`TikTok could not publish it: ${s.failReason || 'unknown reason'}`);
    return false;
  }

  /** Re-checks a post that was still processing. */
  async refreshStatus(id: number) {
    const post = await this.get(id);
    if (!post.publishId) throw new BadRequestException('This post was not sent to TikTok yet');
    try {
      this.applyStatus(post, await this.client().status(await this.token(), post.publishId));
    } catch (err: any) {
      post.status = 'failed';
      post.error = err.message;
    }
    return this.view(await this.repo.save(post));
  }
}
