import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';
import { AiStrategy } from '../analysis/ai.strategy';
import { isMarketClosed } from '../common/forex';
import { AccessService } from '../bot/access.service';
import { AccessStatus } from '../bot/bot-user.entity';
import { BotService } from '../bot/bot.service';
import { TwelveDataService } from '../market-data/twelve-data.service';
import { PairsService } from '../pairs/pairs.service';
import { ScannerJob } from '../scheduler/scanner.job';
import { DEFAULT_SYSTEM_PROMPT } from '../settings/settings.defaults';
import { SettingsService } from '../settings/settings.service';
import { SettingsGroup, StrategyMode } from '../settings/settings.types';
import { ActivityLogService } from '../signals/activity-log.service';
import { ResultTrackerService } from '../signals/result-tracker.service';
import { CHARTS_DIR, SignalsService } from '../signals/signals.service';
import { TelegramService } from '../telegram/telegram.service';
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
    private readonly market: TwelveDataService,
    private readonly ai: AiStrategy,
    private readonly bot: BotService,
    private readonly access: AccessService,
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
      enabledPairs: (await this.pairs.enabled()).length,
      stats: await this.signals.stats(),
      pendingAccess: this.access.enabled ? await this.access.pendingCount() : 0,
      activity: this.log.list(),
      setup: {
        marketData: !!this.settings.get('marketData').apiKey,
        openai: !!this.settings.get('ai').apiKey,
        telegram: !!this.settings.get('telegram').botToken && !!this.settings.get('telegram').channelId,
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

  @Get('telegram/chats')
  detectedChats() {
    return this.bot.detectedChats();
  }

  @Get('bot')
  botOverview() {
    return this.bot.overview();
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
  testTelegram() {
    return wrap(() => this.telegram.test());
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
