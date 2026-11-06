import { Module } from '@nestjs/common';
import { ChannelSender } from './channel-sender.service';
import { TelegramUserService } from './telegram-user.service';
import { TelegramService } from './telegram.service';

@Module({
  providers: [TelegramService, TelegramUserService, ChannelSender],
  exports: [TelegramService, TelegramUserService, ChannelSender],
})
export class TelegramModule {}
