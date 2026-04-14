import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PeopleCollectionService,
  PEOPLE_COLLECTION_QUEUE,
} from './people-collection.service.js';
import { JobLogger } from '../../../common/utils/index.js';

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
  private readonly logger = new Logger(PeopleCollectionProcessor.name);
  private readonly jobLogger = new JobLogger(PeopleCollectionProcessor.name);

  constructor(
    private readonly peopleCollectionService: PeopleCollectionService,
  ) {
    super();
  }

  async process(job: Job<PeopleCollectionJobData>): Promise<any> {
    const { firmId, firmName } = job.data;
    this.logger.log(
      `Processing people collection job for: ${firmName} (${firmId})`,
    );
    this.jobLogger.log(
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
      this.jobLogger.error(
        `People collection job failed for ${firmName}: ${error}`,
      );
      throw error;
    }
  }
}
