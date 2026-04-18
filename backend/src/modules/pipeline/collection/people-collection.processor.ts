import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  PeopleCollectionService,
  PEOPLE_COLLECTION_QUEUE,
} from './people-collection.service.js';
import { CommonLogger } from '../../../common/utils/index.js';

export interface PeopleCollectionJobData {
  firmId: string;
  firmName: string;
}

@Processor(PEOPLE_COLLECTION_QUEUE, {
  concurrency: 10,
  lockDuration: 300000,
  lockRenewTime: 150000,
})
export class PeopleCollectionProcessor extends WorkerHost {
  private readonly logger = new CommonLogger(PeopleCollectionProcessor.name);

  constructor(
    private readonly peopleCollectionService: PeopleCollectionService,
  ) {
    super();
  }

  async process(
    job: Job<PeopleCollectionJobData>,
  ): Promise<{ success: boolean; sourcesCollected: number }> {
    const { firmId, firmName } = job.data;
    this.logger.log(
      `Processing people collection job for: ${firmName} (${firmId})`,
    );

    try {
      const count = await this.peopleCollectionService.collectPeopleForFirm(
        firmId,
        String(job.id),
      );
      return { success: true, sourcesCollected: count };
    } catch (error) {
      this.logger.error(
        `People collection job failed for ${firmName}: ${error}`,
      );
      throw error;
    }
  }
}
