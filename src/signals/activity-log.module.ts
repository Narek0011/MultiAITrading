import { Global, Module } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';

/** One activity log for the whole app (signals, news, Telegram sending). */
@Global()
@Module({
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
