import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmSignal } from '../../../database/entities/firm-signal.entity.js';
import { FirmScore } from '../../../database/entities/firm-score.entity.js';
import { ScoreEvidence } from '../../../database/entities/score-evidence.entity.js';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity.js';
import { JobType, JobStatus } from '../../../common/enums/index.js';
import {
  ScoringConfig,
  DEFAULT_SCORING_CONFIG,
  toDimensionScoreJson,
  toScoringParametersJson,
  DimensionScoreKey,
} from '../../../common/interfaces/index.js';
import { ScoringEngine } from './scoring-engine.js';
import { CommonLogger } from '../../../common/utils/index.js';

@Injectable()
export class ScoringService {
  private readonly logger = new CommonLogger(ScoringService.name);
  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmSignal)
    private readonly signalRepo: Repository<FirmSignal>,
    @InjectRepository(FirmScore)
    private readonly scoreRepo: Repository<FirmScore>,
    @InjectRepository(ScoreEvidence)
    private readonly evidenceRepo: Repository<ScoreEvidence>,
    @InjectRepository(ScrapeJob)
    private readonly jobRepo: Repository<ScrapeJob>,
    private readonly scoringEngine: ScoringEngine,
  ) {}

  async scoreFirm(
    firmId: string,
    config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  ): Promise<FirmScore | null> {
    const signals = await this.signalRepo.find({ where: { firm_id: firmId } });

    if (signals.length < config.thresholds.min_signals_for_score) {
      this.logger.debug(
        `Skipping firm ${firmId}: ${signals.length} signals (minimum: ${config.thresholds.min_signals_for_score})`,
      );

      return null;
    }

    const result = this.scoringEngine.scoreFirm(signals, config);

    const existingScore = await this.scoreRepo.findOne({
      where: { firm_id: firmId, score_version: config.version },
    });

    if (existingScore) {
      await this.evidenceRepo.delete({ firm_score_id: existingScore.id });
      existingScore.overall_score = result.overallScore;
      existingScore.dimension_scores = Object.fromEntries(
        result.dimensions.map((d) => [d.dimension, toDimensionScoreJson(d)]),
      );
      existingScore.signal_count = result.signalCount;
      existingScore.scoring_parameters = toScoringParametersJson(config);
      existingScore.scored_at = new Date();
      await this.scoreRepo.save(existingScore);

      await this.saveEvidence(existingScore.id, result.evidence);
      await this.computeRanks(config.version);
      return existingScore;
    }

    const firmScore = this.scoreRepo.create({
      firm_id: firmId,
      score_version: config.version,
      overall_score: result.overallScore,
      dimension_scores: Object.fromEntries(
        result.dimensions.map((d) => [d.dimension, toDimensionScoreJson(d)]),
      ),
      signal_count: result.signalCount,
      scoring_parameters: toScoringParametersJson(config),
    });
    await this.scoreRepo.save(firmScore);
    await this.saveEvidence(firmScore.id, result.evidence);
    await this.computeRanks(config.version);

    return firmScore;
  }

  async scoreAllFirms(
    config: ScoringConfig = DEFAULT_SCORING_CONFIG,
    queueJobId?: string,
  ): Promise<{ scored: number; failed: number }> {
    const job = this.jobRepo.create({
      job_type: JobType.SCORE,
      status: JobStatus.RUNNING,
      started_at: new Date(),
      queue_job_id: queueJobId ?? null,
      metadata: { score_version: config.version },
    });
    await this.jobRepo.save(job);

    try {
      const firms = await this.firmRepo
        .createQueryBuilder('firm')
        .select('firm.id')
        .where('firm.is_active = :active', { active: true })
        .andWhere((qb) => {
          const sub = qb
            .subQuery()
            .select('fs.firm_id')
            .from(FirmSignal, 'fs')
            .where('fs.firm_id = firm.id')
            .getQuery();
          return `EXISTS ${sub}`;
        })
        .getMany();

      if (firms.length === 0) {
        this.logger.warn(
          'No firms have signals — skipping scoring. Run collection and extraction first.',
        );

        job.status = JobStatus.COMPLETED;
        job.completed_at = new Date();
        job.metadata = {
          ...job.metadata,
          scored: 0,
          failed: 0,
          skipped_reason: 'no_signals',
        };
        await this.jobRepo.save(job);
        return { scored: 0, failed: 0 };
      }

      let scored = 0;
      let failed = 0;

      for (const firm of firms) {
        try {
          const result = await this.scoreFirm(firm.id, config);
          if (result) {
            scored++;
          }
        } catch (error) {
          this.logger.error(`Failed to score firm ${firm.id}: ${error}`);

          failed++;
        }
      }

      await this.computeRanks(config.version);

      job.status = JobStatus.COMPLETED;
      job.completed_at = new Date();
      job.metadata = { ...job.metadata, scored, failed };
      await this.jobRepo.save(job);

      this.logger.log(
        `Scoring complete (${config.version}): ${scored} scored, ${failed} failed`,
      );

      return { scored, failed };
    } catch (error) {
      job.status = JobStatus.FAILED;
      job.error_message = String(error);
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw error;
    }
  }

  async rescoreAllFirms(
    config: ScoringConfig,
  ): Promise<{ scored: number; failed: number }> {
    this.logger.log(`Re-scoring all firms with version: ${config.version}`);

    return this.scoreAllFirms(config);
  }

  private async computeRanks(scoreVersion: string): Promise<void> {
    const result: Array<{ id: string }> = await this.scoreRepo.query(
      `UPDATE firm_scores AS fs
       SET rank = sub.rnk
       FROM (
         SELECT id,
                RANK() OVER (ORDER BY overall_score DESC) AS rnk
         FROM firm_scores
         WHERE score_version = $1
       ) AS sub
       WHERE fs.id = sub.id
         AND fs.score_version = $1
       RETURNING fs.id`,
      [scoreVersion],
    );

    this.logger.log(
      `Computed ranks for ${result.length} firms (version: ${scoreVersion})`,
    );
  }

  private async saveEvidence(
    firmScoreId: string,
    evidence: Array<{
      signalId: string;
      dimension: DimensionScoreKey;
      weightApplied: number;
      pointsContributed: number;
      reasoning: string;
    }>,
  ): Promise<void> {
    const entities = evidence
      .filter((e) => e.signalId)
      .map((e) =>
        this.evidenceRepo.create({
          firm_score_id: firmScoreId,
          firm_signal_id: e.signalId,
          dimension: e.dimension,
          weight_applied: e.weightApplied,
          points_contributed: e.pointsContributed,
          reasoning: e.reasoning,
        }),
      );

    if (entities.length > 0) {
      await this.evidenceRepo.save(entities);
    }
  }
}
