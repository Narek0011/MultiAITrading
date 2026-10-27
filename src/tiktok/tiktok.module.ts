import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChartsModule } from '../charts/charts.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { SignalsModule } from '../signals/signals.module';
import { TikTokPost } from './tiktok-post.entity';
import { TikTokService } from './tiktok.service';

@Module({
  imports: [TypeOrmModule.forFeature([TikTokPost]), ChartsModule, MarketDataModule, SignalsModule],
  providers: [TikTokService],
  exports: [TikTokService],
})
export class TikTokModule {}
