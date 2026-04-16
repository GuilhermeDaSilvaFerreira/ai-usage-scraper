import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import { v7 as uuidv7 } from 'uuid';
import { SEEDING_QUEUE } from './seeding/seeding.service.js';
import { JobLogger } from '../../common/utils/index.js';

const CRON_JOB_NAME = 'pipeline-full-run';

@Injectable()
export class PipelineCronService implements OnModuleInit {
  private readonly logger = new JobLogger(PipelineCronService.name);
  private readonly cronSchedule: string;
  private readonly seedTarget: number;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    @InjectQueue(SEEDING_QUEUE)
    private readonly seedingQueue: Queue,
  ) {
    this.cronSchedule = this.config.get<string>(
      'pipeline.cronSchedule',
      '0 0 * * 0',
    );
    this.seedTarget = this.config.get<number>('pipeline.seedTarget', 50);
  }

  onModuleInit(): void {
    const job = CronJob.from({
      cronTime: this.cronSchedule,
      onTick: () => this.runFullPipeline(),
      start: true,
    });

    this.schedulerRegistry.addCronJob(CRON_JOB_NAME, job);

    this.logger.log(
      `Pipeline cron registered: "${this.cronSchedule}" (seed target: ${this.seedTarget})`,
    );
  }

  async runFullPipeline(): Promise<void> {
    this.logger.log(
      `Cron trigger: starting full pipeline (seed target: ${this.seedTarget})`,
    );

    await this.seedingQueue.add(
      'seed',
      { targetFirmCount: this.seedTarget },
      { jobId: uuidv7(), attempts: 1, removeOnComplete: false },
    );

    this.logger.log(
      'Cron trigger: seeding job enqueued — pipeline will auto-chain through collection, extraction, and scoring',
    );
  }
}
