import { Module } from '@nestjs/common';
import { TelegramUserService } from './telegram-user.service';
import { TelegramService } from './telegram.service';

@Module({
  providers: [TelegramService, TelegramUserService],
  exports: [TelegramService, TelegramUserService],
})
export class TelegramModule {}
