import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SeedingService, SEEDING_QUEUE } from './seeding.service.js';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service.js';
import { JobLogger } from '../../../common/utils/index.js';

export interface SeedingJobData {
  targetFirmCount: number;
}

@Processor(SEEDING_QUEUE, { concurrency: 3 })
export class SeedingProcessor extends WorkerHost {
  private readonly logger = new JobLogger(SeedingProcessor.name);

  constructor(
    private readonly seedingService: SeedingService,
    private readonly orchestrator: PipelineOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<SeedingJobData>): Promise<any> {
    const { targetFirmCount } = job.data;
    this.logger.log(
      `Processing seeding job (target: ${targetFirmCount} firms)`,
    );

    try {
      const result = await this.seedingService.seed(
        targetFirmCount,
        String(job.id),
      );

      if (this.orchestrator.isAutoChainEnabled()) {
        this.logger.log(`Seeding complete — auto-chaining to collection stage`);
        const collectionResult =
          await this.orchestrator.triggerCollectionForAllFirms();
        return {
          success: true,
          ...result,
          autoChain: {
            collectionTriggered: true,
            ...collectionResult,
          },
        };
      }

      return { success: true, ...result };
    } catch (error) {
      this.logger.error('Seeding job failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
