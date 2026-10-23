import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { isMarketClosed } from '../common/forex';
import { SettingsService } from '../settings/settings.service';
import { ActivityLogService } from '../signals/activity-log.service';
import { ResultTrackerService } from '../signals/result-tracker.service';
import { SignalsService } from '../signals/signals.service';

const JOB = 'signal-scanner';

/** Runs the tracker + scanner on the interval configured in Admin → General, rescheduling live. */
@Injectable()
export class ScannerJob implements OnModuleInit, OnApplicationShutdown {
  private intervalMinutes = 0;
  nextRunAt: Date | null = null;

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly signals: SignalsService,
    private readonly tracker: ResultTrackerService,
    private readonly log: ActivityLogService,
  ) {}

  onModuleInit() {
    this.schedule();
    this.settings.events.on('changed', (group: string) => {
      if (group === 'general') this.schedule();
    });
  }

  onApplicationShutdown() {
    if (this.registry.doesExist('interval', JOB)) this.registry.deleteInterval(JOB);
  }

  private schedule() {
    const minutes = Math.max(1, this.settings.get('general').scanIntervalMinutes);
    if (minutes === this.intervalMinutes && this.registry.doesExist('interval', JOB)) return;
    if (this.registry.doesExist('interval', JOB)) this.registry.deleteInterval(JOB);
    this.intervalMinutes = minutes;
    this.registry.addInterval(JOB, setInterval(() => void this.tick(), minutes * 60_000));
    this.nextRunAt = new Date(Date.now() + minutes * 60_000);
    this.log.add('info', `Scanner scheduled every ${minutes} min`);
  }

  async tick() {
    this.nextRunAt = new Date(Date.now() + this.intervalMinutes * 60_000);
    try {
      if (!isMarketClosed()) await this.tracker.track();
      const res = await this.signals.scan(false);
      if (res.skipped) this.log.add('info', `Scheduled scan skipped: ${res.skipped}`);
    } catch (err: any) {
      this.log.add('error', `Scheduled run failed: ${err.message}`);
    }
  }
}
