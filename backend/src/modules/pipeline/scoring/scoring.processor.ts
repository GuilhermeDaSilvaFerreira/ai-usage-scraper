import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScoringService } from './scoring.service.js';
import {
  ScoringConfig,
  DEFAULT_SCORING_CONFIG,
} from '../../../common/interfaces/index.js';
import { JobLogger } from '../../../common/utils/index.js';

export const SCORING_QUEUE = 'scoring';

export interface ScoringJobData {
  firmId?: string;
  config?: ScoringConfig;
  scoreAll?: boolean;
}

@Processor(SCORING_QUEUE, { concurrency: 5 })
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoringProcessor.name);
  private readonly jobLogger = new JobLogger(ScoringProcessor.name);

  constructor(private readonly scoringService: ScoringService) {
    super();
  }

  async process(job: Job<ScoringJobData>): Promise<any> {
    const { firmId, config, scoreAll } = job.data;
    const scoringConfig = config || DEFAULT_SCORING_CONFIG;

    if (scoreAll) {
      this.logger.log(
        `Processing batch scoring job (version: ${scoringConfig.version})`,
      );
      this.jobLogger.log(
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
      this.jobLogger.log(`Processing scoring job for firm: ${firmId}`);
      const score = await this.scoringService.scoreFirm(firmId, scoringConfig);
      if (!score) {
        this.logger.warn(`Firm ${firmId} has no signals — skipping scoring`);
        this.jobLogger.warn(`Firm ${firmId} has no signals — skipping scoring`);
        return { success: true, skipped: true, reason: 'no_signals' };
      }
      return {
        success: true,
        scoreId: score.id,
        overall_score: score.overall_score,
      };
    }

    this.logger.error('Either firmId or scoreAll must be provided');
    this.jobLogger.error('Either firmId or scoreAll must be provided');
    throw new Error('Either firmId or scoreAll must be provided');
  }
}
