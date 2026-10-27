import { Module } from '@nestjs/common';
import { ChartRendererService } from './chart-renderer.service';
import { NewsCardRendererService } from './news-card-renderer.service';
import { SocialCardRendererService } from './social-card-renderer.service';

@Module({
  providers: [ChartRendererService, NewsCardRendererService, SocialCardRendererService],
  exports: [ChartRendererService, NewsCardRendererService, SocialCardRendererService],
})
export class ChartsModule {}
