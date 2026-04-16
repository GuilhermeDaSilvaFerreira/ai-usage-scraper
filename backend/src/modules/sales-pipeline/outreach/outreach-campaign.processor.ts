import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OutreachService } from './outreach.service.js';
import { JobLogger } from '../../../common/utils/index.js';

export const OUTREACH_CAMPAIGNS_QUEUE = 'outreach-campaigns';

export interface OutreachCampaignJobData {
  firmId: string;
}

@Processor(OUTREACH_CAMPAIGNS_QUEUE, { concurrency: 5 })
export class OutreachCampaignProcessor extends WorkerHost {
  private readonly logger = new JobLogger(OutreachCampaignProcessor.name);

  constructor(private readonly outreachService: OutreachService) {
    super();
  }

  async process(job: Job<OutreachCampaignJobData>): Promise<any> {
    const { firmId } = job.data;

    this.logger.log(`Creating default outreach campaigns for firm ${firmId}`);

    const created =
      await this.outreachService.createDefaultCampaignsForFirm(firmId);

    this.logger.log(`Created ${created} outreach campaigns for firm ${firmId}`);

    return { success: true, firmId, campaignsCreated: created };
  }
}
