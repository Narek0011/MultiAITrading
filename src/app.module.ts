import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { LandingModule } from './landing/landing.module';
import { NewsModule } from './news/news.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // Small single-instance app: the schema is kept in sync with the entities on boot.
        synchronize: true,
      }),
    }),
    ScheduleModule.forRoot(),
    SettingsModule,
    SchedulerModule,
    AdminModule,
    LandingModule,
    NewsModule,
  ],
})
export class AppModule {}
