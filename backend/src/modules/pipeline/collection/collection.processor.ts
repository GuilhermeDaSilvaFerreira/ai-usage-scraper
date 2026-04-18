import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CollectionService, COLLECTION_QUEUE } from './collection.service.js';
import { JobLogger } from '../../../common/utils/index.js';

export interface CollectionJobData {
  firmId: string;
  firmName: string;
}

@Processor(COLLECTION_QUEUE, {
  concurrency: 10,
  lockDuration: 300000,
  lockRenewTime: 150000,
})
export class CollectionProcessor extends WorkerHost {
  private readonly logger = new JobLogger(CollectionProcessor.name);

  constructor(private readonly collectionService: CollectionService) {
    super();
  }

  async process(
    job: Job<CollectionJobData>,
  ): Promise<{ success: boolean; sourcesCollected: number }> {
    const { firmId, firmName } = job.data;
    this.logger.log(`Processing collection job for: ${firmName} (${firmId})`);

    try {
      const count = await this.collectionService.collectForFirm(
        firmId,
        String(job.id),
      );
      return { success: true, sourcesCollected: count };
    } catch (error) {
      this.logger.error(`Collection job failed for ${firmName}: ${error}`);
      throw error;
    }
  }
}
