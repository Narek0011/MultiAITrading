import { Module } from '@nestjs/common';
import { SignalsModule } from '../signals/signals.module';
import { ScannerJob } from './scanner.job';

@Module({
  imports: [SignalsModule],
  providers: [ScannerJob],
  exports: [ScannerJob],
})
export class SchedulerModule {}
