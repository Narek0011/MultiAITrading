import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { isMarketClosed } from '../common/forex';
import { SettingsService } from '../settings/settings.service';
import { ActivityLogService } from '../signals/activity-log.service';
import { ResultTrackerService } from '../signals/result-tracker.service';
import { SignalsService } from '../signals/signals.service';
import { nextSignalTime, openSlot, parseSignalTimes, RETRY_EVERY_MIN } from './signal-schedule';

const JOB = 'signal-scanner';

/**
 * Runs the tracker + scanner on the interval configured in Admin → General, rescheduling live.
 * In 'times' mode the interval only tracks results, and a per-minute check posts the best signal(s) at each set time.
 */
@Injectable()
export class ScannerJob implements OnModuleInit, OnApplicationShutdown {
  private intervalMinutes = 0;
  nextRunAt: Date | null = null;
  private slotTimer: NodeJS.Timeout | null = null;
  /** Last attempt per "day time" slot, so an unfilled slot is retried every RETRY_EVERY_MIN. */
  private attempts = new Map<string, number>();

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly signals: SignalsService,
    private readonly tracker: ResultTrackerService,
    private readonly log: ActivityLogService,
  ) {}

  onModuleInit() {
    this.slotTimer = setInterval(() => void this.minuteTick(), 60_000);
    this.schedule();
    this.settings.events.on('changed', (group: string) => {
      if (group === 'general') this.schedule();
    });
  }

  onApplicationShutdown() {
    if (this.slotTimer) clearInterval(this.slotTimer);
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
      if (this.settings.get('general').scheduleMode === 'times') return;
      const res = await this.signals.scan(false);
      if (res.skipped) this.log.add('info', `Scheduled scan skipped: ${res.skipped}`);
    } catch (err: any) {
      this.log.add('error', `Scheduled run failed: ${err.message}`);
    }
  }

  /** The next set time and its timezone, when the time schedule is on. */
  nextSignalTime() {
    const g = this.settings.get('general');
    if (g.scheduleMode !== 'times') return null;
    const time = nextSignalTime(new Date(), g.signalTimezone, parseSignalTimes(g.signalTimes));
    return time ? { time, timezone: g.signalTimezone } : null;
  }

  /** Every minute: settle expiry-style signals on time, then check the signal-time schedule. */
  private async minuteTick() {
    try {
      if (!isMarketClosed()) await this.tracker.settleExpired();
    } catch (err: any) {
      this.log.add('error', `Expiry results failed: ${err.message}`);
    }
    await this.slotTick();
  }

  async slotTick() {
    const g = this.settings.get('general');
    if (g.scheduleMode !== 'times' || !g.botEnabled) return;
    const now = new Date();
    const slot = openSlot(now, g.signalTimezone, parseSignalTimes(g.signalTimes), g.signalTimeWindowMinutes);
    if (!slot) return;
    const key = `${slot.day} ${slot.time}`;
    const last = this.attempts.get(key);
    if (last && now.getTime() - last < RETRY_EVERY_MIN * 60_000) return;
    // Signals already posted since the slot started count toward it (also covers restarts).
    const want = Math.max(1, g.signalsPerTime) - (await this.signals.countSince(slot.startedAt));
    if (want <= 0) return;
    this.attempts.set(key, now.getTime());
    for (const k of this.attempts.keys()) if (!k.startsWith(slot.day)) this.attempts.delete(k);
    try {
      const res = await this.signals.scanBest(want);
      if (res.skipped === 'A scan is already running') this.attempts.delete(key);
      else if (res.skipped) this.log.add('info', `Signal time ${slot.time} skipped: ${res.skipped}`);
      else if (!res.posted) this.log.add('info', `Signal time ${slot.time}: no setup qualified${g.signalTimeWindowMinutes > 0 ? ` — retrying every ${RETRY_EVERY_MIN} min for up to ${g.signalTimeWindowMinutes} min` : ''}`);
    } catch (err: any) {
      this.log.add('error', `Signal time ${slot.time} failed: ${err.message}`);
    }
  }
}
