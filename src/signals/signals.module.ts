import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from '../analysis/analysis.module';
import { ChartsModule } from '../charts/charts.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PairsModule } from '../pairs/pairs.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AnalyzingService } from './analyzing.service';
import { ResultTrackerService } from './result-tracker.service';
import { Signal } from './signal.entity';
import { SignalsService } from './signals.service';

@Module({
  imports: [TypeOrmModule.forFeature([Signal]), AnalysisModule, ChartsModule, MarketDataModule, PairsModule, TelegramModule],
  providers: [SignalsService, ResultTrackerService, AnalyzingService],
  exports: [SignalsService, ResultTrackerService, AnalyzingService],
})
export class SignalsModule {}
