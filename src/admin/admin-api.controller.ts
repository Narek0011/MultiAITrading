/// <reference types="multer" />
import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { join } from 'path';
import { AiStrategy } from '../analysis/ai.strategy';
import { isMarketClosed } from '../common/forex';
import { AccessService } from '../bot/access.service';
import { AccessStatus } from '../bot/bot-user.entity';
import { BotService } from '../bot/bot.service';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { isValidTimeZone, NEWS_TYPES, newsFormatChoice, NewsType } from '../news/news-schedule';
import { invalidSignalTimes, parseSignalTimes } from '../scheduler/signal-schedule';
import { activeSignalChannels, normaliseTelegramBody } from '../telegram/signal-channels';
import { CUSTOM_STYLES, CustomStyle } from '../news/news-drafts';
import { NewsService } from '../news/news.service';
import { PairsService } from '../pairs/pairs.service';
import { ScannerJob } from '../scheduler/scanner.job';
import { LEGAL_DEFAULTS } from '../landing/legal-texts';
import { DEFAULT_SYSTEM_PROMPT } from '../settings/settings.defaults';
import { SettingsService } from '../settings/settings.service';
import { SettingsGroup, StrategyMode } from '../settings/settings.types';
import { ActivityLogService } from '../signals/activity-log.service';
import { STATS_PERIODS, StatsPeriod } from '../signals/period-stats';
import { ResultTrackerService } from '../signals/result-tracker.service';
import { CHARTS_DIR, SignalsService } from '../signals/signals.service';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramUserService } from '../telegram/telegram-user.service';
import { VISIT_PERIODS, VisitPeriod } from '../landing/visits';
import { VisitsService } from '../landing/visits.service';
import { AdminGuard } from './admin.guard';

const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err: any) {
    throw new BadRequestException(err?.message ?? String(err));
  }
};

@UseGuards(AdminGuard)
@Controller('admin/api')
export class AdminApiController {
  constructor(
    private readonly settings: SettingsService,
    private readonly pairs: PairsService,
    private readonly signals: SignalsService,
    private readonly tracker: ResultTrackerService,
    private readonly scanner: ScannerJob,
    private readonly log: ActivityLogService,
    private readonly telegram: TelegramService,
    private readonly tgUser: TelegramUserService,
    private readonly market: TwelveDataService,
    private readonly ai: AiStrategy,
    private readonly bot: BotService,
    private readonly access: AccessService,
    private readonly news: NewsService,
    private readonly visits: VisitsService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const g = this.settings.get('general');
    return {
      botEnabled: g.botEnabled,
      mode: g.mode,
      timeframe: g.timeframe,
      scanning: this.signals.isScanning,
      lastScanAt: this.signals.lastScanAt,
      nextRunAt: g.botEnabled ? this.scanner.nextRunAt : null,
      nextSignalTime: g.botEnabled ? this.scanner.nextSignalTime() : null,
      enabledPairs: (await this.pairs.enabled()).length,
      stats: await this.signals.stats(),
      pendingAccess: this.access.enabled ? await this.access.pendingCount() : 0,
      activity: this.log.list(),
      setup: {
        marketData: !!this.settings.get('marketData').apiKey,
        openai: !!this.settings.get('ai').apiKey,
        telegram: !!this.settings.get('telegram').botToken && activeSignalChannels(this.settings.get('telegram'), g.signalLanguage).length > 0,
        landing: !!this.settings.get('landing').signalsChannelUrl && !!this.settings.get('landing').supportUrl,
      },
    };
  }

  @Get('settings')
  getSettings() {
    return { settings: this.settings.masked(), defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT };
  }

  @Put('settings/:group')
  async saveSettings(@Param('group') group: SettingsGroup, @Body() body: Record<string, unknown>) {
    if (group === 'general') validateSignalSchedule(body);
    if (group === 'telegram') normaliseTelegramBody(body, this.settings.get('general').signalLanguage);
    await this.settings.update(group, body as any);
    return { ok: true, settings: this.settings.masked() };
  }

  @Get('pairs')
  listPairs() {
    return this.pairs.list();
  }

  @Patch('pairs/:id')
  setPair(@Param('id', ParseIntPipe) id: number, @Body() body: { enabled: boolean }) {
    return this.pairs.setEnabled(id, !!body.enabled);
  }

  @Post('pairs/all')
  setAllPairs(@Body() body: { enabled: boolean }) {
    return this.pairs.setAllEnabled(!!body.enabled);
  }

  @Post('pairs/:id/preview')
  preview(@Param('id', ParseIntPipe) id: number, @Body() body: { mode?: StrategyMode }) {
    return wrap(() => this.signals.preview(id, body.mode));
  }

  @Post('scan')
  @HttpCode(202)
  scanNow() {
    if (this.signals.isScanning) return { ok: false, message: 'A scan is already running' };
    if (isMarketClosed()) return { ok: false, message: 'Forex market is closed (weekend) — scans resume Sunday 21:00 UTC' };
    void this.tracker.track().then(() => this.signals.scan(true)).catch((err) => this.log.add('error', `Manual scan failed: ${err.message}`));
    return { ok: true, message: 'Scan started — watch the activity log' };
  }

  @Get('signals')
  listSignals(@Query() q: { status?: string; pair?: string; page?: number }) {
    return this.signals.list(q);
  }

  @Get('signals/:id/chart')
  async chart(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const s = await this.signals.get(id);
    if (!s.imageFile) throw new NotFoundException('No chart for this signal');
    res.sendFile(join(CHARTS_DIR, s.imageFile));
  }

  @Post('signals/:id/resend')
  resend(@Param('id', ParseIntPipe) id: number) {
    return wrap(async () => ({ signal: await this.signals.resend(id) }));
  }

  /** Telegram (Premium) account that posts signals instead of the bot. */
  @Get('telegram/account')
  telegramAccount() {
    return this.tgUser.status();
  }

  @Post('telegram/account/code')
  telegramSendCode(@Body() body: { phone?: string }) {
    return wrap(() => this.tgUser.sendCode(String(body?.phone ?? '')));
  }

  @Post('telegram/account/login')
  telegramLogin(@Body() body: { code?: string; password?: string }) {
    return wrap(async () => ({ ...(await this.tgUser.signIn(String(body?.code ?? ''), body?.password ? String(body.password) : undefined)), settings: this.settings.masked() }));
  }

  @Post('telegram/account/logout')
  telegramLogout() {
    return wrap(async () => ({ ...(await this.tgUser.logout()), settings: this.settings.masked() }));
  }

  /** Website visitors: unique IPs, page views, countries, sources and the IP list. */
  @Get('visitors')
  visitors(@Query('period') period?: string) {
    return this.visits.summary(VISIT_PERIODS.includes(period as VisitPeriod) ? (period as VisitPeriod) : '7d');
  }

  @Get('telegram/chats')
  detectedChats() {
    return this.bot.detectedChats();
  }

  @Get('bot')
  botOverview() {
    return this.bot.overview();
  }

  /** Default Terms / Privacy texts, for "Reset to default" in Admin → Legal pages. */
  @Get('legal/defaults')
  legalDefaults() {
    return LEGAL_DEFAULTS;
  }

  @Get('news')
  newsOverview() {
    return this.news.overview();
  }

  /** Preview and Post now return a job id at once; the browser polls `news/jobs/:id` (avoids proxy timeouts). */
  @Post('news/preview')
  newsPreview(@Body() body: NewsActionBody) {
    return this.news.startPreview(newsType(body.type), newsOptions(body));
  }

  @Post('news/post-now')
  newsPostNow(@Body() body: NewsActionBody) {
    return this.news.startPostNow(newsType(body.type), newsOptions(body));
  }

  /** The admin's own post: returns a job whose result is the preview draft (nothing is sent yet). */
  @Post('news/custom')
  @UseInterceptors(FileInterceptor('upload', { limits: { fileSize: 10 * 1024 * 1024 } }))
  newsCustom(@Body() body: Record<string, string>, @UploadedFile() file?: Express.Multer.File) {
    const image = (['none', 'upload', 'card', 'chart'].includes(body.image) ? body.image : 'none') as 'none' | 'upload' | 'card' | 'chart';
    if (image === 'upload' && !file) throw new BadRequestException('Choose an image to upload, or pick another image option');
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG or WebP image');
    let channels: string[] = [];
    try {
      channels = (JSON.parse(body.channels || '[]') as unknown[]).filter((c): c is string => typeof c === 'string');
    } catch {
      channels = [];
    }
    return this.news.startCustom({
      headline: String(body.headline ?? '').slice(0, 200),
      text: String(body.text ?? '').slice(0, 4000),
      style: CUSTOM_STYLES.includes(body.style as CustomStyle) ? (body.style as CustomStyle) : 'plain',
      image,
      pair: String(body.pair ?? 'EUR/USD'),
      channels,
      sourceLang: (['en', 'ru', 'es', 'hy'].includes(body.sourceLang) ? body.sourceLang : 'ru') as 'ru',
      translate: body.translate !== 'false',
      polish: body.polish === 'true',
      upload: file ? { buffer: file.buffer, mimetype: file.mimetype } : null,
    });
  }

  /** Publishes a previewed draft exactly as shown. */
  /** Signal results for a period as a news draft (preview first, then the normal Publish). */
  @Post('news/stats')
  newsStats(@Body() body: { period?: string; channels?: unknown }) {
    const period = STATS_PERIODS.includes(body?.period as StatsPeriod) ? (body.period as StatsPeriod) : '7d';
    return wrap(async () => ({ draft: this.news.draftView(await this.news.prepareStats(period, newsOptions(body).channels)) }));
  }

  @Post('news/drafts/:id/publish')
  newsPublishDraft(@Param('id') id: string) {
    return this.news.startPublishDraft(id);
  }

  @Get('news/jobs/:id')
  newsJob(@Param('id') id: string) {
    return this.news.job(id);
  }

  @Post('news/test')
  newsTest(@Body() body: { channel?: string }) {
    return wrap(() => this.news.test(typeof body?.channel === 'string' ? body.channel : undefined));
  }

  @Get('access/requests')
  accessRequests(@Query('status') status?: AccessStatus) {
    return this.access.requests(status || undefined);
  }

  @Post('access/:userId/approve')
  approveAccess(@Param('userId') userId: string) {
    return wrap(async () => ({ user: await this.access.approve(userId) }));
  }

  @Post('access/:userId/reject')
  rejectAccess(@Param('userId') userId: string) {
    return wrap(async () => ({ user: await this.access.reject(userId) }));
  }

  @Post('access/join-link')
  createJoinLink() {
    return wrap(async () => ({ joinLink: await this.access.createJoinLink(), settings: this.settings.masked() }));
  }

  @Post('test/telegram')
  testTelegram(@Body() body: { channel?: string }) {
    return wrap(() => this.telegram.test(typeof body?.channel === 'string' ? body.channel : undefined));
  }

  /** Posts a fake sample signal to the channel so the admin can check the look. */
  @Post('test/signal')
  testSignal() {
    return wrap(() => this.signals.sendTest());
  }

  @Post('test/market-data')
  testMarket() {
    return wrap(() => this.market.testConnection());
  }

  @Post('test/openai')
  testOpenAi() {
    return wrap(async () => {
      const models = await this.ai.listModels();
      return { models, selectedAvailable: models.includes(this.settings.get('ai').model) };
    });
  }
}

function validateSignalSchedule(body: Record<string, unknown>) {
  const times = String(body.signalTimes ?? '');
  const bad = invalidSignalTimes(times);
  if (bad.length) throw new BadRequestException(`Not a valid time (use HH:MM, 24h): ${bad.join(', ')}`);
  if (body.signalTimezone != null && !isValidTimeZone(String(body.signalTimezone).trim())) throw new BadRequestException(`Unknown timezone: ${body.signalTimezone}`);
  if (body.scheduleMode === 'every' && !(Number(body.everyMinutes) >= 1)) throw new BadRequestException('"Every (minutes)" must be at least 1');
  if (body.scheduleMode === 'times' && !parseSignalTimes(times).length) throw new BadRequestException('Add at least one signal time, e.g. 15:00, 18:00, 22:00');
}

const newsType = (t?: string): NewsType => (NEWS_TYPES.includes(t as NewsType) ? (t as NewsType) : 'midday');

interface NewsActionBody {
  type?: NewsType;
  format?: string;
  channels?: unknown;
}
const newsOptions = (body: NewsActionBody) => ({
  format: newsFormatChoice(body?.format),
  channels: Array.isArray(body?.channels) ? body.channels.filter((c): c is string => typeof c === 'string') : [],
});
