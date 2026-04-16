import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { OutreachCampaign } from '../../../database/entities/outreach-campaign.entity.js';
import { Person } from '../../../database/entities/person.entity.js';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmSignal } from '../../../database/entities/firm-signal.entity.js';
import { FirmScore } from '../../../database/entities/firm-score.entity.js';
import { OutreachController } from './outreach.controller.js';
import { OutreachService } from './outreach.service.js';
import { OutreachMessageService } from './outreach-message.service.js';
import {
  OutreachCampaignProcessor,
  OUTREACH_CAMPAIGNS_QUEUE,
} from './outreach-campaign.processor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutreachCampaign,
      Person,
      Firm,
      FirmSignal,
      FirmScore,
    ]),
    BullModule.registerQueue({ name: OUTREACH_CAMPAIGNS_QUEUE }),
  ],
  controllers: [OutreachController],
  providers: [OutreachService, OutreachMessageService, OutreachCampaignProcessor],
  exports: [OutreachService, OutreachMessageService],
})
export class OutreachModule {}
