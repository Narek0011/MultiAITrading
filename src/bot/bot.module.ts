import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramModule } from '../telegram/telegram.module';
import { AccessService } from './access.service';
import { BotChat } from './bot-chat.entity';
import { BotUser } from './bot-user.entity';
import { BotService } from './bot.service';

@Module({
  imports: [TypeOrmModule.forFeature([BotUser, BotChat]), TelegramModule],
  providers: [BotService, AccessService],
  exports: [BotService, AccessService],
})
export class BotModule {}
