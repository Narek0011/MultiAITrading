import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChartsModule } from '../charts/charts.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { SignalsModule } from '../signals/signals.module';
import { TelegramModule } from '../telegram/telegram.module';
import { NewsPost } from './news-post.entity';
import { NewsJob } from './news.job';
import { NewsService } from './news.service';

@Module({
  imports: [TypeOrmModule.forFeature([NewsPost]), ChartsModule, MarketDataModule, SignalsModule, TelegramModule],
  providers: [NewsService, NewsJob],
  exports: [NewsService],
})
export class NewsModule {}
