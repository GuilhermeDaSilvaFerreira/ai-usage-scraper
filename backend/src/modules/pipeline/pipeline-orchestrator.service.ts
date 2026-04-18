import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v7 as uuidv7 } from 'uuid';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { Firm } from '../../database/entities/firm.entity.js';
import { FirmSignal } from '../../database/entities/firm-signal.entity.js';
import {
  COLLECTION_QUEUE,
  PEOPLE_COLLECTION_QUEUE,
} from './collection/collection.constants.js';
import { SCORING_QUEUE } from './scoring/scoring.processor.js';
import { CommonLogger } from '../../common/utils/index.js';

const REDIS_KEY_PREFIX = 'pipeline:firm:';
const PENDING_EXTRACTIONS_SUFFIX = ':pending_extractions';
const COUNTER_TTL_SECONDS = 86400; // 24h

@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new CommonLogger(PipelineOrchestratorService.name);
  private readonly redis: Redis;
  private readonly autoChain: boolean;

  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmSignal)
    private readonly signalRepo: Repository<FirmSignal>,
    @InjectQueue(COLLECTION_QUEUE)
    private readonly signalCollectionQueue: Queue,
    @InjectQueue(PEOPLE_COLLECTION_QUEUE)
    private readonly peopleCollectionQueue: Queue,
    @InjectQueue(SCORING_QUEUE)
    private readonly scoringQueue: Queue,
    private readonly config: ConfigService,
  ) {
    this.autoChain = this.config.get<boolean>('pipeline.autoChain', true);
    this.redis = new Redis({
      host: this.config.get<string>('redis.host', 'localhost'),
      port: this.config.get<number>('redis.port', 6379),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    this.redis.connect().catch((err) => {
      this.logger.error(`Redis connection failed for orchestrator: ${err}`);
    });
  }

  isAutoChainEnabled(): boolean {
    return this.autoChain;
  }

  async triggerCollectionForAllFirms(): Promise<{
    firmCount: number;
    signalJobCount: number;
    peopleJobCount: number;
  }> {
    const firms = await this.firmRepo
      .createQueryBuilder('f')
      .select(['f.id', 'f.name'])
      .where('f.is_active = :active', { active: true })
      .andWhere(
        '(f.last_collected_at IS NULL OR f.last_collected_at < :cutoff)',
        { cutoff: dayjs().subtract(24, 'hours').toDate() },
      )
      .getMany();

    if (firms.length === 0) {
      this.logger.log(
        'Auto-chain: no firms need collection (all collected within 24h)',
      );

      return { firmCount: 0, signalJobCount: 0, peopleJobCount: 0 };
    }

    const jobOpts = () => ({
      jobId: uuidv7(),
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
    });

    await Promise.all([
      this.signalCollectionQueue.addBulk(
        firms.map((firm) => ({
          name: 'collect-signals',
          data: { firmId: firm.id, firmName: firm.name },
          opts: jobOpts(),
        })),
      ),
      this.peopleCollectionQueue.addBulk(
        firms.map((firm) => ({
          name: 'collect-people',
          data: { firmId: firm.id, firmName: firm.name },
          opts: jobOpts(),
        })),
      ),
    ]);

    this.logger.log(
      `Auto-chain: queued collection for ${firms.length} firms (signals + people)`,
    );


    return {
      firmCount: firms.length,
      signalJobCount: firms.length,
      peopleJobCount: firms.length,
    };
  }

  async trackExtractionBatch(firmId: string, count: number): Promise<void> {
    if (!this.isAutoChainEnabled()) return;

    const key = `${REDIS_KEY_PREFIX}${firmId}${PENDING_EXTRACTIONS_SUFFIX}`;
    await this.redis.set(key, count, 'EX', COUNTER_TTL_SECONDS);

    this.logger.debug(
      `Auto-chain: tracking ${count} pending extractions for firm ${firmId}`,
    );
  }

  async onExtractionComplete(firmId: string): Promise<void> {
    if (!this.isAutoChainEnabled()) return;

    const key = `${REDIS_KEY_PREFIX}${firmId}${PENDING_EXTRACTIONS_SUFFIX}`;
    const remaining = await this.redis.decr(key);

    this.logger.debug(
      `Auto-chain: extraction complete for firm ${firmId}, ${remaining} remaining`,
    );

    if (remaining <= 0) {
      await this.redis.del(key);
      await this.triggerScoringForFirm(firmId);
    }
  }

  async onCollectionCompleteNoExtractions(firmId: string): Promise<void> {
    if (!this.isAutoChainEnabled()) return;

    const hasSignals = await this.signalRepo
      .createQueryBuilder('s')
      .select('1')
      .where('s.firm_id = :firmId', { firmId })
      .limit(1)
      .getRawOne();

    if (hasSignals) {
      this.logger.log(
        `Auto-chain: no new extractions for firm ${firmId}, but existing signals found — triggering scoring`,
      );

      await this.triggerScoringForFirm(firmId);
    } else {
      this.logger.debug(
        `Auto-chain: no extractions and no existing signals for firm ${firmId} — skipping scoring`,
      );
    }
  }

  async triggerScoringForFirm(firmId: string): Promise<void> {
    const jobId = `score-firm-${firmId}`;

    const existing = await this.scoringQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        this.logger.debug(
          `Auto-chain: scoring job already ${state} for firm ${firmId} — skipping`,
        );
        return;
      }
    }

    await this.scoringQueue.add('score', { firmId }, { jobId });

    this.logger.log(`Auto-chain: queued scoring for firm ${firmId}`);

  }
}
