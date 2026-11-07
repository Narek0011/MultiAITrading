import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotModule } from '../bot/bot.module';
import { ChartsModule } from '../charts/charts.module';
import { PairsModule } from '../pairs/pairs.module';
import { SignalsModule } from '../signals/signals.module';
import { LandingController } from './landing.controller';
import { Visit } from './visit.entity';
import { VisitsService } from './visits.service';

@Module({
  imports: [TypeOrmModule.forFeature([Visit]), BotModule, ChartsModule, PairsModule, SignalsModule],
  controllers: [LandingController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class LandingModule {}
