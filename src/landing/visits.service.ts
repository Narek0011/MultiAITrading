import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { LessThan, Repository } from 'typeorm';
import { visitorCountry } from './geo-lang';
import { Visit } from './visit.entity';
import { clientIp, deviceOf, isBot, isSpamReferrer, KEEP_DAYS, referrerHost, SELF, sourceOfReferrer, SOURCES, VisitPeriod, visitPeriodStart, visitSource } from './visits';

const DAY_MS = 24 * 3_600_000;

/** Counts website visits (who, from which country and site) for Admin → Visitors. */
@Injectable()
export class VisitsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VisitsService.name);
  private cleanup: NodeJS.Timeout | null = null;

  constructor(@InjectRepository(Visit) private readonly repo: Repository<Visit>) {}

  onModuleInit() {
    void this.prune();
    this.cleanup = setInterval(() => void this.prune(), DAY_MS);
  }

  onModuleDestroy() {
    if (this.cleanup) clearInterval(this.cleanup);
  }

  /** Saves a page view in the background; never slows down or breaks the page. Bots are ignored. */
  record(req: Request, path: string) {
    const ua = String(req.headers['user-agent'] ?? '');
    if (req.method !== 'GET' || isBot(ua)) return;
    const ip = clientIp(req);
    if (!ip) return;
    const rawReferrer = String(req.headers.referer ?? '');
    const ownHost = req.get('host') ?? '';
    const referrer = referrerHost(rawReferrer, ownHost);
    if (isSpamReferrer(referrer)) return;
    const visit = this.repo.create({
      ip,
      country: visitorCountry(req),
      path,
      referrer,
      source: visitSource({ src: req.query?.src, utm: req.query?.utm_source, ua, referrer: rawReferrer, ownHost }),
      device: deviceOf(ua),
    });
    this.repo.save(visit).catch((err) => this.logger.warn(`Visit not saved: ${err.message}`));
  }

  /** People (unique IPs), page views, per day, countries, sources and the IP list for the period. */
  async summary(period: VisitPeriod) {
    const from = visitPeriodStart(period);
    const base = () => this.repo.createQueryBuilder('v').where('v.createdAt >= :from', { from });

    const totals = await base().select('COUNT(*)', 'views').addSelect('COUNT(DISTINCT v.ip)', 'visitors').getRawOne();
    const perDay = await base()
      .select(`to_char(date_trunc('day', v.createdAt AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`, 'day')
      .addSelect('COUNT(DISTINCT v.ip)', 'visitors')
      .addSelect('COUNT(*)', 'views')
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany();
    const countries = await base()
      .select('v.country', 'country')
      .addSelect('COUNT(DISTINCT v.ip)', 'visitors')
      .addSelect('COUNT(*)', 'views')
      .groupBy('v.country')
      .orderBy('visitors', 'DESC')
      .getRawMany();
    // Old visits (before sources were saved) get theirs from the referrer; spam referrers are left out.
    const sourceRows = await base()
      .select('v.source', 'source')
      .addSelect('v.referrer', 'referrer')
      .addSelect('v.ip', 'ip')
      .addSelect('COUNT(*)', 'views')
      .groupBy('v.source')
      .addGroupBy('v.referrer')
      .addGroupBy('v.ip')
      .getRawMany();
    const bySource = new Map<string, { source: string; ips: Set<string>; views: number; sites: Map<string, number> }>();
    const ipSource = new Map<string, string>();
    for (const r of sourceRows) {
      if (isSpamReferrer(r.referrer)) continue;
      const source: string = r.source ?? sourceOfReferrer(r.referrer);
      if (source === SELF) continue;
      const entry = bySource.get(source) ?? { source, ips: new Set(), views: 0, sites: new Map() };
      entry.ips.add(r.ip);
      entry.views += Number(r.views);
      if (source === 'other' && r.referrer) entry.sites.set(r.referrer, (entry.sites.get(r.referrer) ?? 0) + Number(r.views));
      bySource.set(source, entry);
      // Per IP, a named source beats "direct".
      if (!ipSource.has(r.ip) || ipSource.get(r.ip) === 'direct') ipSource.set(r.ip, source);
    }
    const sources = [...bySource.values()]
      .map((e) => ({ source: e.source, visitors: e.ips.size, views: e.views, sites: [...e.sites].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([host, views]) => ({ host, views })) }))
      .sort((a, b) => b.visitors - a.visitors || b.views - a.views);
    const ips = await base()
      .select('v.ip', 'ip')
      .addSelect('MAX(v.country)', 'country')
      .addSelect('COUNT(*)', 'visits')
      .addSelect('MIN(v.createdAt)', 'firstSeen')
      .addSelect('MAX(v.createdAt)', 'lastSeen')
      .addSelect('MAX(v.device)', 'device')
      .groupBy('v.ip')
      .orderBy('visits', 'DESC')
      .addOrderBy('"lastSeen"', 'DESC')
      .limit(200)
      .getRawMany();

    const n = (v: unknown) => Number(v ?? 0);
    return {
      period,
      from,
      visitors: n(totals?.visitors),
      views: n(totals?.views),
      perDay: perDay.map((d) => ({ day: d.day, visitors: n(d.visitors), views: n(d.views) })),
      countries: countries.map((c) => ({ country: c.country, visitors: n(c.visitors), views: n(c.views) })),
      sources,
      sourceList: SOURCES,
      ips: ips.map((r) => ({ ip: r.ip, country: r.country, visits: n(r.visits), firstSeen: r.firstSeen, lastSeen: r.lastSeen, device: r.device, source: ipSource.get(r.ip) ?? null })),
    };
  }

  private async prune() {
    await this.repo.delete({ createdAt: LessThan(new Date(Date.now() - KEEP_DAYS * DAY_MS)) }).catch((err) => this.logger.warn(`Old visits not deleted: ${err.message}`));
  }
}
