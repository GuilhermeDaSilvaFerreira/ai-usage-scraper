import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Firm } from '../../database/entities/firm.entity.js';
import { FirmSignal } from '../../database/entities/firm-signal.entity.js';
import { FirmScore } from '../../database/entities/firm-score.entity.js';
import { FirmsController } from './firms.controller.js';
import { FirmsService } from './firms.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Firm, FirmSignal, FirmScore])],
  controllers: [FirmsController],
  providers: [FirmsService],
  exports: [FirmsService],
})
export class FirmsModule {}
