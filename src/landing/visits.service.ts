import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { LessThan, Repository } from 'typeorm';
import { visitorCountry } from './geo-lang';
import { Visit } from './visit.entity';
import { clientIp, deviceOf, isBot, KEEP_DAYS, referrerHost, VisitPeriod, visitPeriodStart } from './visits';

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
    const visit = this.repo.create({
      ip,
      country: visitorCountry(req),
      path,
      referrer: referrerHost(String(req.headers.referer ?? ''), req.get('host') ?? ''),
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
    const sources = await base()
      .select('v.referrer', 'referrer')
      .addSelect('COUNT(*)', 'views')
      .groupBy('v.referrer')
      .orderBy('views', 'DESC')
      .limit(10)
      .getRawMany();
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
      sources: sources.map((s) => ({ referrer: s.referrer, views: n(s.views) })),
      ips: ips.map((r) => ({ ip: r.ip, country: r.country, visits: n(r.visits), firstSeen: r.firstSeen, lastSeen: r.lastSeen, device: r.device })),
    };
  }

  private async prune() {
    await this.repo.delete({ createdAt: LessThan(new Date(Date.now() - KEEP_DAYS * DAY_MS)) }).catch((err) => this.logger.warn(`Old visits not deleted: ${err.message}`));
  }
}
