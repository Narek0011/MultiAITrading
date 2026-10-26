import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { join } from 'path';
import { computeIndicators } from '../analysis/indicators';
import { atrLevels } from '../analysis/levels';
import { BotService } from '../bot/bot.service';
import { ChartRendererService } from '../charts/chart-renderer.service';
import { demoCandles } from '../charts/demo-candles';
import { PairsService } from '../pairs/pairs.service';
import { DEFAULT_SETTINGS } from '../settings/settings.defaults';
import { SettingsService } from '../settings/settings.service';
import { Lang } from '../settings/settings.types';
import { CHARTS_DIR, SignalsService } from '../signals/signals.service';
import { buildAiStatus } from './ai-status';
import { websiteNewsUrl } from '../news/news-channels';
import { DICTIONARIES, LANGS } from './i18n';

const LANG_COOKIE = 'mat_lang';
const LANG_LABEL: Record<Lang, string> = { en: 'EN', ru: 'RU', es: 'ES' };

@Controller()
export class LandingController {
  private demoChart: Buffer | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly pairs: PairsService,
    private readonly signals: SignalsService,
    private readonly charts: ChartRendererService,
    private readonly bot: BotService,
  ) {}

  @Get()
  async landing(@Query('lang') q: string, @Req() req: Request, @Res() res: Response) {
    const lang = this.resolveLang(q, req);
    if (q && LANGS.includes(q as Lang)) res.cookie(LANG_COOKIE, q, { maxAge: 365 * 24 * 3_600_000, sameSite: 'lax' });
    const t = DICTIONARIES[lang];
    const landing = this.settings.get('landing');
    const botUsername = this.bot.status.botUsername;
    const accessUrl = this.settings.get('access').enabled && botUsername ? `https://t.me/${botUsername}?start=access` : null;
    const [pairs, status, results] = await Promise.all([
      this.pairs.list(),
      this.aiStatus(),
      landing.showRecentResults ? this.signals.recentResults(8) : [],
    ]);

    res.render('landing', {
      layout: false,
      t,
      lang,
      langs: LANGS.map((code) => ({ code, label: LANG_LABEL[code], active: code === lang })),
      // With the access flow on, "join" buttons open the bot, which checks the Pocket Option registration.
      signalsUrl: accessUrl ?? (landing.signalsChannelUrl || '#access'),
      accessUrl: accessUrl ?? (landing.supportUrl || '#access'),
      supportUrl: landing.supportUrl || '#access',
      newsUrl: websiteNewsUrl(this.settings.get('news')),
      status,
      showStatus: status.state !== 'offline',
      showStats: landing.showStats,
      showWinRate: landing.showStats && status.winRate != null,
      showSignalsTotal: landing.showStats && status.signalsTotal > 0,
      showResults: landing.showRecentResults && results.length > 0,
      results: results.map((r) => ({ ...r, label: t.outcome[r.status as keyof typeof t.outcome] ?? r.status, pipsLabel: `${r.pips > 0 ? '+' : ''}${r.pips}` })),
      pairs: pairs.map((p) => ({ symbol: p.symbol, base: p.symbol.split('/')[0], quote: p.symbol.split('/')[1] })),
      // Data for the client-side AI console and live status (rendered via the `json` helper).
      clientData: { console: t.console, status: t.status, initial: status },
      year: new Date().getUTCFullYear(),
      publicUrl: process.env.PUBLIC_URL ?? '',
    });
  }

  /** Aggregate-only status for the landing page. Never exposes open signals or levels. */
  @Get('api/public/ai-status')
  @Header('Cache-Control', 'public, max-age=30')
  aiStatusEndpoint() {
    return this.aiStatus();
  }

  private async aiStatus() {
    const g = this.settings.get('general');
    const [pairs, stats] = await Promise.all([this.pairs.enabled(), this.signals.stats()]);
    return buildAiStatus({
      botEnabled: g.botEnabled,
      scanIntervalMinutes: g.scanIntervalMinutes,
      lastScanAt: this.signals.lastScanAt,
      analysesToday: this.signals.analysesToday,
      pairsMonitored: pairs.length,
      stats,
    });
  }

  /** Social preview image: latest closed real signal chart, else the demo chart. */
  @Get('sample-chart.png')
  @Header('Cache-Control', 'public, max-age=600')
  async sampleChart(@Res() res: Response) {
    const latest = await this.signals.latestClosedChart();
    if (latest?.imageFile) return res.sendFile(join(CHARTS_DIR, latest.imageFile), (err) => err && this.sendDemo(res));
    this.sendDemo(res);
  }

  /** Fixed demo chart used by the "Inside one AI decision" section (hotspot positions depend on it). */
  @Get('demo-chart.png')
  @Header('Cache-Control', 'public, max-age=86400')
  demoChartPng(@Res() res: Response) {
    this.sendDemo(res);
  }

  private sendDemo(res: Response) {
    if (!this.demoChart) {
      const candles = demoCandles();
      const indicators = computeIndicators(candles, { rsiPeriod: 14, emaFast: 21, emaSlow: 50, macdFast: 12, macdSlow: 26, macdSignal: 9, atrPeriod: 14 });
      const entry = candles[candles.length - 1].close;
      const atr = indicators.atr[indicators.atr.length - 1]!;
      // Default risk settings keep the layout stable regardless of admin changes.
      const levels = atrLevels('EUR/USD', 'BUY', entry, atr, DEFAULT_SETTINGS.risk);
      this.demoChart = this.charts.renderPng({
        pair: 'EUR/USD',
        timeframe: '15min',
        candles,
        indicators,
        emaLabels: ['EMA 21', 'EMA 50'],
        signal: { direction: 'BUY', confidence: 84, ...levels },
      });
    }
    res.type('png').send(this.demoChart);
  }

  private resolveLang(q: string | undefined, req: Request): Lang {
    if (q && LANGS.includes(q as Lang)) return q as Lang;
    const cookie = req.cookies?.[LANG_COOKIE];
    if (LANGS.includes(cookie)) return cookie;
    const accepted = (req.headers['accept-language'] ?? '').toLowerCase();
    return (LANGS.find((l) => accepted.startsWith(l)) ?? 'en') as Lang;
  }
}
