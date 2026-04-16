import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v7 as uuidv7 } from 'uuid';
import { Firm } from '../../database/entities/firm.entity.js';
import { ScrapeJob } from '../../database/entities/scrape-job.entity.js';
import { SEEDING_QUEUE } from './seeding/seeding.service.js';
import { ScoringService } from './scoring/scoring.service.js';
import {
  COLLECTION_QUEUE,
  EXTRACTION_QUEUE,
} from './collection/collection.service.js';
import { PEOPLE_COLLECTION_QUEUE } from './collection/people-collection.service.js';
import { SCORING_QUEUE } from './scoring/scoring.processor.js';
import { OUTREACH_CAMPAIGNS_QUEUE } from '../sales-pipeline/outreach/outreach-campaign.processor.js';
import {
  ScoringConfig,
  DEFAULT_SCORING_CONFIG,
} from '../../common/interfaces/index.js';
import {
  SeedRequestDto,
  SeedResponseDto,
  CollectSingleResponseDto,
  CollectBatchResponseDto,
  ScoreConfigDto,
  ScoreResponseDto,
  RescoreResponseDto,
  StatusResponseDto,
} from './dto/index.js';

@ApiTags('Pipeline')
@Controller('pipeline')
export class PipelineController {
  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(ScrapeJob)
    private readonly jobRepo: Repository<ScrapeJob>,
    @InjectQueue(SEEDING_QUEUE)
    private readonly seedingQueue: Queue,
    @InjectQueue(COLLECTION_QUEUE)
    private readonly signalCollectionQueue: Queue,
    @InjectQueue(PEOPLE_COLLECTION_QUEUE)
    private readonly peopleCollectionQueue: Queue,
    @InjectQueue(EXTRACTION_QUEUE)
    private readonly extractionQueue: Queue,
    @InjectQueue(SCORING_QUEUE)
    private readonly scoringQueue: Queue,
    @InjectQueue(OUTREACH_CAMPAIGNS_QUEUE)
    private readonly outreachCampaignsQueue: Queue,
    private readonly config: ConfigService,
    private readonly scoringService: ScoringService,
  ) {}

  @Post('seed')
  @ApiOperation({
    summary: 'Seed the firm universe (async)',
    description:
      'Enqueues a BullMQ job to discover PE and private credit firms from SEC EDGAR, Exa semantic search, and public rankings. ' +
      'The target is the desired TOTAL number of firms in the DB. If the DB already has that many, ' +
      'no work is done. Otherwise the job keeps searching until the DB reaches the target (up to 5 rounds). ' +
      'Returns immediately with the job ID.',
  })
  @ApiBody({ type: SeedRequestDto, required: true })
  @ApiResponse({
    status: 201,
    description: 'Seeding job queued',
    type: SeedResponseDto,
  })
  async seed(@Body() body: SeedRequestDto): Promise<SeedResponseDto> {
    const targetFirmCount = body.target_firm_count;
    const job = await this.seedingQueue.add(
      'seed',
      { targetFirmCount },
      { jobId: uuidv7(), attempts: 1, removeOnComplete: false },
    );

    return {
      message: `Seeding job queued (target: ${targetFirmCount} total firms in DB)`,
      job_id: String(job.id),
      target_firm_count: targetFirmCount,
    };
  }

  @Post('collect')
  @ApiOperation({
    summary: 'Collect AI signals and people for all active firms (async)',
    description:
      'Enqueues two parallel BullMQ job sets per firm: one for AI signal collection ' +
      '(news, hiring, conferences, website, LinkedIn posts) and one for people collection ' +
      '(LinkedIn profiles, website team pages). Each pipeline writes to data_sources and ' +
      'populates the signals or people tables respectively.',
  })
  @ApiResponse({
    status: 201,
    description: 'Collection jobs queued',
    type: CollectBatchResponseDto,
  })
  async collect(): Promise<CollectBatchResponseDto> {
    const firms = await this.firmRepo
      .createQueryBuilder('f')
      .select(['f.id', 'f.name'])
      .where('f.is_active = :active', { active: true })
      .andWhere(
        '(f.last_collected_at IS NULL OR f.last_collected_at < :cutoff)',
        { cutoff: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      )
      .getMany();

    if (firms.length === 0) {
      return {
        message: 'No firms need collection (all collected within the last 24h)',
        firm_count: 0,
        signal_job_count: 0,
        people_job_count: 0,
      };
    }

    const jobOpts = (id?: string) => ({
      jobId: id ?? uuidv7(),
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

    return {
      message: `Queued collection for ${firms.length} firms (signals + people)`,
      firm_count: firms.length,
      signal_job_count: firms.length,
      people_job_count: firms.length,
    };
  }

  @Post(':firm_id/collect')
  @ApiOperation({
    summary: 'Collect AI signals and people for a single firm (async)',
    description:
      'Enqueues two BullMQ jobs for a single firm: one for signal collection ' +
      'and one for people collection, processed in parallel.',
  })
  @ApiParam({
    name: 'firm_id',
    description: 'UUID of the firm to collect signals for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 201,
    description: 'Collection jobs queued',
    type: CollectSingleResponseDto,
  })
  async collectFirm(
    @Param('firm_id') firmId: string,
  ): Promise<CollectSingleResponseDto> {
    const [signalJob, peopleJob] = await Promise.all([
      this.signalCollectionQueue.add(
        'collect-signals',
        { firmId, firmName: '' },
        { jobId: uuidv7() },
      ),
      this.peopleCollectionQueue.add(
        'collect-people',
        { firmId, firmName: '' },
        { jobId: uuidv7() },
      ),
    ]);

    return {
      message: `Collection jobs queued for firm ${firmId} (signals + people)`,
      signal_job_id: String(signalJob.id),
      people_job_id: String(peopleJob.id),
    };
  }

  @Post('score')
  @ApiOperation({
    summary: 'Score all active firms (async)',
    description:
      'Enqueues a BullMQ job to score all firms using a pure-TypeScript scoring engine. ' +
      'Supports custom version labels and dimension weights for A/B testing. ' +
      'If no config is provided, uses the default v1.0 weights.',
  })
  @ApiBody({ type: ScoreConfigDto, required: false })
  @ApiResponse({
    status: 201,
    description: 'Scoring job queued',
    type: ScoreResponseDto,
  })
  async score(@Body() body?: ScoreConfigDto): Promise<ScoreResponseDto> {
    const config = this.buildScoringConfig(body);

    const job = await this.scoringQueue.add(
      'score',
      {
        scoreAll: true,
        config,
      },
      { jobId: uuidv7() },
    );

    return {
      message: `Scoring job queued (version: ${config.version})`,
      job_id: String(job.id),
      config,
    };
  }

  @Post('rescore')
  @ApiOperation({
    summary: 'Re-score all firms (no re-scraping)',
    description:
      'Replays existing firm_signals through a new scoring configuration without re-scraping. ' +
      'This is ideal for A/B testing scoring weights: change the version label and weights, ' +
      'then compare results side-by-side.',
  })
  @ApiBody({ type: ScoreConfigDto })
  @ApiResponse({
    status: 201,
    description: 'Re-scoring completed',
    type: RescoreResponseDto,
  })
  async rescore(@Body() body: ScoreConfigDto): Promise<RescoreResponseDto> {
    const config = this.buildScoringConfig(body);

    const result = await this.scoringService.rescoreAllFirms(config);

    return {
      message: `Re-scoring complete (version: ${config.version})`,
      ...result,
    };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Pipeline health & queue status',
    description:
      'Returns live BullMQ queue counts (waiting, active, completed, failed, delayed) for ' +
      'signal collection, people collection, extraction, and scoring queues, plus the 20 most recent scrape jobs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue counts and recent job history',
    type: StatusResponseDto,
  })
  async getStatus(): Promise<StatusResponseDto> {
    const [
      seedingCounts,
      signalCollectionCounts,
      peopleCollectionCounts,
      extractionCounts,
      scoringCounts,
      outreachCampaignsCounts,
    ] = await Promise.all([
      this.getQueueCounts(this.seedingQueue),
      this.getQueueCounts(this.signalCollectionQueue),
      this.getQueueCounts(this.peopleCollectionQueue),
      this.getQueueCounts(this.extractionQueue),
      this.getQueueCounts(this.scoringQueue),
      this.getQueueCounts(this.outreachCampaignsQueue),
    ]);

    const recentJobs = await this.jobRepo.find({
      order: { created_at: 'DESC' },
      take: 20,
      relations: ['firm'],
    });

    return {
      queues: {
        seeding: seedingCounts,
        signal_collection: signalCollectionCounts,
        people_collection: peopleCollectionCounts,
        extraction: extractionCounts,
        scoring: scoringCounts,
        outreach_campaigns: outreachCampaignsCounts,
      },
      recent_jobs: recentJobs.map((j) => ({
        id: j.id,
        type: j.job_type,
        status: j.status,
        firm_name: j.firm?.name || null,
        started_at: j.started_at,
        completed_at: j.completed_at,
        error_message: j.error_message,
        metadata: j.metadata,
      })),
    };
  }

  private async getQueueCounts(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }

  private buildScoringConfig(body?: ScoreConfigDto): ScoringConfig {
    return {
      version: body?.version || DEFAULT_SCORING_CONFIG.version,
      weights: {
        aiTalentDensity:
          body?.weights?.ai_talent_density ??
          DEFAULT_SCORING_CONFIG.weights.aiTalentDensity,
        publicAIActivity:
          body?.weights?.public_ai_activity ??
          DEFAULT_SCORING_CONFIG.weights.publicAIActivity,
        aiHiringVelocity:
          body?.weights?.ai_hiring_velocity ??
          DEFAULT_SCORING_CONFIG.weights.aiHiringVelocity,
        thoughtLeadership:
          body?.weights?.thought_leadership ??
          DEFAULT_SCORING_CONFIG.weights.thoughtLeadership,
        vendorPartnerships:
          body?.weights?.vendor_partnerships ??
          DEFAULT_SCORING_CONFIG.weights.vendorPartnerships,
        portfolioAIStrategy:
          body?.weights?.portfolio_ai_strategy ??
          DEFAULT_SCORING_CONFIG.weights.portfolioAIStrategy,
      },
      thresholds: {
        minSignalsForScore:
          body?.thresholds?.min_signals_for_score ??
          DEFAULT_SCORING_CONFIG.thresholds.minSignalsForScore,
        highConfidenceThreshold:
          body?.thresholds?.high_confidence_threshold ??
          DEFAULT_SCORING_CONFIG.thresholds.highConfidenceThreshold,
      },
    };
  }
}
