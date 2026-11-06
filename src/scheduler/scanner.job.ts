import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { isMarketClosed } from '../common/forex';
import { SettingsService } from '../settings/settings.service';
import { ActivityLogService } from '../signals/activity-log.service';
import { AnalyzingService } from '../signals/analyzing.service';
import { ResultTrackerService } from '../signals/result-tracker.service';
import { SignalsService } from '../signals/signals.service';
import { everySlot, nextSignalTime, openSlot, parseSignalTimes, RETRY_EVERY_MIN } from './signal-schedule';

const JOB = 'signal-scanner';

/**
 * Runs the tracker + scanner on the interval configured in Admin → General, rescheduling live.
 * In 'times' and 'every' modes the interval only tracks results, and a per-minute check posts the best signal(s)
 * at each set time / every N minutes.
 */
@Injectable()
export class ScannerJob implements OnModuleInit, OnApplicationShutdown {
  private intervalMinutes = 0;
  nextRunAt: Date | null = null;
  private slotTimer: NodeJS.Timeout | null = null;
  /** Last attempt per "day time" slot, so an unfilled slot is retried every RETRY_EVERY_MIN. */
  private attempts = new Map<string, number>();
  /** Last "every N minutes" slot that was run. */
  private lastEvery = '';

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly signals: SignalsService,
    private readonly tracker: ResultTrackerService,
    private readonly analyzing: AnalyzingService,
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
      if (this.settings.get('general').scheduleMode !== 'interval') return;
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
    await this.everyTick();
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
      if (await this.signals.scanBlocked()) return void this.attempts.delete(key);
      const res = await this.withAnalyzing(() => this.signals.scanBest(want));
      if (res.skipped === 'A scan is already running') this.attempts.delete(key);
      else if (res.skipped) this.log.add('info', `Signal time ${slot.time} skipped: ${res.skipped}`);
      else if (!res.posted) this.log.add('info', `Signal time ${slot.time}: no setup qualified${g.signalTimeWindowMinutes > 0 ? ` — retrying every ${RETRY_EVERY_MIN} min for up to ${g.signalTimeWindowMinutes} min` : ''}`);
    } catch (err: any) {
      this.log.add('error', `Signal time ${slot.time} failed: ${err.message}`);
    }
  }

  /** "Every N minutes" mode: once per clock-aligned slot, post the best pair (or the best above the floor). */
  async everyTick() {
    const g = this.settings.get('general');
    if (g.scheduleMode !== 'every' || !g.botEnabled) return;
    const slot = everySlot(new Date(), g.signalTimezone, g.everyMinutes);
    if (slot.key === this.lastEvery) return;
    const blocked = await this.signals.scanBlocked();
    // A running scan may finish within the slot, so try again next minute; other reasons skip the slot.
    if (blocked === 'A scan is already running') return;
    this.lastEvery = slot.key;
    if (blocked) return this.log.add('info', `Every ${g.everyMinutes} min signal skipped: ${blocked}`);
    // Already posted in this slot (e.g. right before a restart).
    if ((await this.signals.countSince(slot.startedAt)) > 0) return;
    try {
      const res = await this.withAnalyzing(() => this.signals.scanBest(1, { floor: g.everyFloorConfidence }));
      if (res.skipped) this.log.add('info', `Every ${g.everyMinutes} min signal skipped: ${res.skipped}`);
      else if (!res.posted) this.log.add('info', `Every ${g.everyMinutes} min: no pair reached ${g.everyFloorConfidence}% confidence — no signal this time`);
    } catch (err: any) {
      this.log.add('error', `Every ${g.everyMinutes} min signal failed: ${err.message}`);
    }
  }

  /** Shows "AI is analyzing…" in the channels while `run` picks the signal, then removes it. */
  private async withAnalyzing<T>(run: () => Promise<T>): Promise<T> {
    const posts = await this.analyzing.start();
    try {
      return await run();
    } finally {
      await this.analyzing.finish(posts);
    }
  }
}
