import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ScoringService } from './scoring.service.js';
import {
  ScoringConfig,
  DEFAULT_SCORING_CONFIG,
} from '../../../common/interfaces/index.js';
import { CommonLogger } from '../../../common/utils/index.js';
import { OUTREACH_CAMPAIGNS_QUEUE } from '../../sales-pipeline/outreach/outreach-campaign.processor.js';

export const SCORING_QUEUE = 'scoring';

export interface ScoringJobData {
  firmId?: string;
  config?: ScoringConfig;
  scoreAll?: boolean;
}

@Processor(SCORING_QUEUE, { concurrency: 5 })
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new CommonLogger(ScoringProcessor.name);

  constructor(
    private readonly scoringService: ScoringService,
    @InjectQueue(OUTREACH_CAMPAIGNS_QUEUE)
    private readonly outreachQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ScoringJobData>): Promise<unknown> {
    const { firmId, config, scoreAll } = job.data;
    const scoringConfig = config || DEFAULT_SCORING_CONFIG;

    if (scoreAll) {
      this.logger.log(
        `Processing batch scoring job (version: ${scoringConfig.version})`,
      );
      const result = await this.scoringService.scoreAllFirms(
        scoringConfig,
        String(job.id),
      );
      return { success: true, ...result };
    }

    if (firmId) {
      this.logger.log(`Processing scoring job for firm: ${firmId}`);
      const score = await this.scoringService.scoreFirm(firmId, scoringConfig);
      if (!score) {
        this.logger.warn(`Firm ${firmId} has no signals — skipping scoring`);
        return { success: true, skipped: true, reason: 'no_signals' };
      }
      await this.outreachQueue.add(
        'create-campaigns',
        { firmId },
        { jobId: `outreach-${firmId}` },
      );

      return {
        success: true,
        scoreId: score.id,
        overall_score: score.overall_score,
      };
    }

    this.logger.error('Either firmId or scoreAll must be provided');
    throw new Error('Either firmId or scoreAll must be provided');
  }
}
