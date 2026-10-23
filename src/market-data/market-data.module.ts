import { Module } from '@nestjs/common';
import { TwelveDataService } from './twelve-data.service';

@Module({
  providers: [TwelveDataService],
  exports: [TwelveDataService],
})
export class MarketDataModule {}
