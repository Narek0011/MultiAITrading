import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pair } from './pair.entity';
import { PairsService } from './pairs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pair])],
  providers: [PairsService],
  exports: [PairsService],
})
export class PairsModule {}
