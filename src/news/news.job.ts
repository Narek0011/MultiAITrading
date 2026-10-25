import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ActivityLogService } from '../signals/activity-log.service';
import { dueSlots, parseSlots, zonedParts } from './news-schedule';
import { NewsService } from './news.service';

/** Checks every minute whether a news slot is due and publishes it. */
@Injectable()
export class NewsJob implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly settings: SettingsService,
    private readonly news: NewsService,
    private readonly log: ActivityLogService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const cfg = this.settings.get('news');
    if (!cfg.enabled || this.running) return;
    const now = new Date();
    const { day, weekend } = zonedParts(now, cfg.timezone);
    if (cfg.skipWeekends && weekend) return;
    this.running = true;
    try {
      const due = dueSlots(now, cfg.timezone, parseSlots(cfg.slots), await this.news.postedSlots(day));
      for (const slot of due) await this.news.publish(slot.type, day, slot.time);
    } catch (err: any) {
      this.log.add('error', `News scheduler: ${err.message}`);
    } finally {
      this.running = false;
    }
  }
}
