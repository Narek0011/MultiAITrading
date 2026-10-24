import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ChartsModule } from '../charts/charts.module';
import { PairsModule } from '../pairs/pairs.module';
import { SignalsModule } from '../signals/signals.module';
import { LandingController } from './landing.controller';

@Module({
  imports: [BotModule, ChartsModule, PairsModule, SignalsModule],
  controllers: [LandingController],
})
export class LandingModule {}
