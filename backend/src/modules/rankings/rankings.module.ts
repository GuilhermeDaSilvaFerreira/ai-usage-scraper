import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirmScore } from '../../database/entities/firm-score.entity.js';
import { RankingsController } from './rankings.controller.js';
import { RankingsService } from './rankings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FirmScore])],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
