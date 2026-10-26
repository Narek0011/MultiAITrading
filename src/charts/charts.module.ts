import { Module } from '@nestjs/common';
import { ChartRendererService } from './chart-renderer.service';
import { NewsCardRendererService } from './news-card-renderer.service';

@Module({
  providers: [ChartRendererService, NewsCardRendererService],
  exports: [ChartRendererService, NewsCardRendererService],
})
export class ChartsModule {}
