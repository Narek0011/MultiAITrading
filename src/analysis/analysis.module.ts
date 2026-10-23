import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { AiStrategy } from './ai.strategy';
import { AnalysisService } from './analysis.service';
import { IndicatorStrategy } from './indicator.strategy';

@Module({
  imports: [MarketDataModule],
  providers: [AiStrategy, IndicatorStrategy, AnalysisService],
  exports: [AnalysisService, AiStrategy],
})
export class AnalysisModule {}
