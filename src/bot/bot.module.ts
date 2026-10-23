import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramModule } from '../telegram/telegram.module';
import { BotUser } from './bot-user.entity';
import { BotService } from './bot.service';

@Module({
  imports: [TypeOrmModule.forFeature([BotUser]), TelegramModule],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
