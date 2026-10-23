import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from '../analysis/analysis.module';
import { BotModule } from '../bot/bot.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PairsModule } from '../pairs/pairs.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SignalsModule } from '../signals/signals.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AdminApiController } from './admin-api.controller';
import { AdminPagesController } from './admin-pages.controller';
import { AdminUser } from './admin-user.entity';
import { AdminGuard } from './admin.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 16) throw new Error('JWT_SECRET must be set (16+ characters)');
        return { secret, signOptions: { expiresIn: '7d' } };
      },
    }),
    AnalysisModule,
    BotModule,
    MarketDataModule,
    PairsModule,
    SchedulerModule,
    SignalsModule,
    TelegramModule,
  ],
  controllers: [AdminPagesController, AdminApiController],
  providers: [AuthService, AdminGuard],
})
export class AdminModule {}
