import { Injectable, Logger } from '@nestjs/common';

export interface ActivityEntry {
  at: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

/** Recent bot activity shown on the admin dashboard (kept in memory). */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger('Bot');
  private readonly entries: ActivityEntry[] = [];

  add(level: ActivityEntry['level'], message: string) {
    this.entries.unshift({ at: new Date().toISOString(), level, message });
    this.entries.length = Math.min(this.entries.length, 150);
    if (level === 'error') this.logger.error(message);
    else if (level === 'warn') this.logger.warn(message);
    else this.logger.log(message);
  }

  list(limit = 60) {
    return this.entries.slice(0, limit);
  }
}
