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
import { SiteLang } from '../settings/settings.types';
import { CHARTS_DIR, SignalsService } from '../signals/signals.service';
import { buildAiStatus } from './ai-status';
import { websiteNewsUrl } from '../news/news-channels';
import { langForCountry, visitorCountry } from './geo-lang';
import { DICTIONARIES, LANG_NAMES, LANGS, RTL_LANGS } from './i18n';
import { LEGAL_LABELS } from './legal';
import { formatUpdated, renderLegal } from './legal-format';
import { VisitsService } from './visits.service';

const LANG_COOKIE = 'mat_lang';
const langMenu = (lang: SiteLang) => LANGS.map((code) => ({ code, label: code.toUpperCase(), name: LANG_NAMES[code], active: code === lang }));
/** "5 min ago" / "3 h ago" / "2 d ago" in the page language. */
function timeAgo(at: Date, t: { minAgo: string; hAgo: string; dAgo: string }) {
  const min = Math.max(1, Math.round((Date.now() - at.getTime()) / 60_000));
  if (min < 60) return t.minAgo.replace('{n}', String(min));
  if (min < 48 * 60) return t.hAgo.replace('{n}', String(Math.round(min / 60)));
  return t.dAgo.replace('{n}', String(Math.round(min / 1440)));
}
const textDir = (lang: SiteLang) => (RTL_LANGS.includes(lang) ? 'rtl' : 'ltr');

@Controller()
export class LandingController {
  private demoChart: Buffer | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly pairs: PairsService,
    private readonly signals: SignalsService,
    private readonly charts: ChartRendererService,
    private readonly bot: BotService,
    private readonly visits: VisitsService,
  ) {}

  @Get()
  async landing(@Query('lang') q: string, @Req() req: Request, @Res() res: Response) {
    this.visits.record(req, '/');
    const lang = this.resolveLang(q, req);
    if (q && LANGS.includes(q as SiteLang)) res.cookie(LANG_COOKIE, q, { maxAge: 365 * 24 * 3_600_000, sameSite: 'lax' });
    const t = DICTIONARIES[lang];
    const landing = this.settings.get('landing');
    const botUsername = this.bot.status.botUsername;
    const accessUrl = this.settings.get('access').enabled && botUsername ? `https://t.me/${botUsername}?start=access` : null;
    const [pairs, status, results, expiry, forex] = await Promise.all([
      this.pairs.list(),
      this.aiStatus(),
      landing.showRecentResults ? this.signals.recentClosed(10) : [],
      landing.showStats ? this.styleStats('expiry') : null,
      landing.showStats ? this.styleStats('forex') : null,
    ]);
    const closed30 = (expiry?.total ?? 0) + (forex?.total ?? 0);
    const bestStreak = Math.max(expiry?.bestStreak ?? 0, forex?.bestStreak ?? 0);
    const reviews = landing.reviews.filter((r) => r.enabled).map((r) => ({ ...r, initial: (r.name || '?').charAt(0).toUpperCase() }));
    const vipPerks = landing.vipPerks.split('\n').map((p) => p.trim()).filter(Boolean);

    res.render('landing', {
      layout: false,
      t,
      lang,
      dir: textDir(lang),
      langLabel: lang.toUpperCase(),
      langs: langMenu(lang),
      // With the access flow on, every "get signals" button opens the bot, which checks the Pocket Option registration.
      accessUrl: accessUrl ?? (landing.signalsChannelUrl || landing.supportUrl || '#access'),
      supportUrl: landing.supportUrl || '#access',
      publicChannelUrl: landing.publicChannelUrl,
      newsUrl: websiteNewsUrl(this.settings.get('news'), lang),
      status,
      showStatus: status.state !== 'offline',
      proof: { expiry, forex, closed30, bestStreak, any: closed30 > 0 },
      heroWinRate: [expiry, forex].filter((x) => x && x.winRate != null).sort((a, b) => b!.total - a!.total)[0]?.winRate ?? null,
      showResults: landing.showRecentResults && results.length > 0,
      results: results.map((r) => ({
        pair: r.pair,
        win: r.win,
        expiry: r.style === 'expiry',
        side: r.style === 'expiry' ? (r.direction === 'BUY' ? t.results.up : t.results.down) : r.direction,
        buy: r.direction === 'BUY',
        label: t.outcome[r.status as keyof typeof t.outcome] ?? r.status,
        ago: timeAgo(r.closedAt, t.results),
      })),
      reviews,
      vip: landing.vipEnabled ? { price: landing.vipPrice, perks: vipPerks } : null,
      pairs: pairs.map((p) => ({ symbol: p.symbol, base: p.symbol.split('/')[0], quote: p.symbol.split('/')[1] })),
      // Data for the client-side AI console and live status (rendered via the `json` helper).
      clientData: { status: t.status, initial: status },
      year: new Date().getUTCFullYear(),
      publicUrl: process.env.PUBLIC_URL ?? '',
      legal: LEGAL_LABELS[lang],
    });
  }

  @Get('terms')
  terms(@Query('lang') q: string, @Req() req: Request, @Res() res: Response) {
    this.legal('terms', q, req, res);
  }

  @Get('privacy')
  privacy(@Query('lang') q: string, @Req() req: Request, @Res() res: Response) {
    this.legal('privacy', q, req, res);
  }

  private legal(page: 'terms' | 'privacy', q: string, req: Request, res: Response) {
    this.visits.record(req, `/${page}`);
    const lang = this.resolveLang(q, req);
    const cfg = this.settings.get('legal');
    const key = `${page}${lang[0].toUpperCase()}${lang[1]}` as 'termsEn';
    const site = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const { title, html } = renderLegal(cfg[key] || cfg[`${page}En` as 'termsEn'], {
      company: cfg.companyName || 'MultiAI Trading',
      email: cfg.contactEmail.trim(),
      support: this.settings.get('landing').supportUrl,
      site,
      updated: formatUpdated(cfg.updated, lang),
    });
    res.render('legal', {
      layout: false,
      lang,
      title: title || (page === 'terms' ? 'Terms of Service' : 'Privacy Policy'),
      html,
      ...LEGAL_LABELS[lang],
      langs: langMenu(lang),
    });
  }

  /** Aggregate-only status for the landing page. Never exposes open signals or levels. */
  @Get('api/public/ai-status')
  @Header('Cache-Control', 'public, max-age=30')
  aiStatusEndpoint() {
    return this.aiStatus();
  }

  /** Last-30-days stats of one signal style; null when it has no wins or losses yet (the tile is then hidden). */
  private async styleStats(style: 'expiry' | 'forex') {
    try {
      const s = await this.signals.periodStats('30d', style);
      return { winRate: s.winRate, wins: s.wins, losses: s.losses, total: s.wins + s.losses, bestStreak: s.bestStreak };
    } catch {
      return null;
    }
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

  private resolveLang(q: string | undefined, req: Request): SiteLang {
    if (q && LANGS.includes(q as SiteLang)) return q as SiteLang;
    const cookie = req.cookies?.[LANG_COOKIE];
    if (LANGS.includes(cookie)) return cookie;
    // No manual choice yet: by the visitor's country (Russian by default).
    return langForCountry(visitorCountry(req));
  }
}
