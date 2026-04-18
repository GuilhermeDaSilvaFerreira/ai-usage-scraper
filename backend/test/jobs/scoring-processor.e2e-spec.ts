import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { createTestApp, TestContext } from '../setup/test-app';
import { truncateAllTables, getRepo } from '../setup/test-db';
import {
  createFirm,
  createFirmSignal,
  SignalType,
  JobType,
  JobStatus,
} from '../setup/fixtures';
import { FirmScore } from '../../src/database/entities/firm-score.entity';
import { ScoreEvidence } from '../../src/database/entities/score-evidence.entity';
import { ScrapeJob } from '../../src/database/entities/scrape-job.entity';
import { ScoringService } from '../../src/modules/pipeline/scoring/scoring.service';
import { DEFAULT_SCORING_CONFIG } from '../../src/common/interfaces/scoring.interfaces';

describe('ScoringProcessor / ScoringService E2E', () => {
  let app: INestApplication;
  let module: TestingModule;
  let scoringService: ScoringService;

  beforeAll(async () => {
    const ctx: TestContext = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    scoringService = module.get(ScoringService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
  });

  describe('ScoringService.scoreFirm', () => {
    it('should create a FirmScore and ScoreEvidence for a firm with signals', async () => {
      const firm = await createFirm(module);
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_HIRING,
        extraction_confidence: 0.9,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
        extraction_confidence: 0.85,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        extraction_confidence: 0.75,
      });

      const result = await scoringService.scoreFirm(firm.id);

      expect(result).not.toBeNull();
      expect(result!.firm_id).toBe(firm.id);
      expect(result!.score_version).toBe('v1.0');
      expect(typeof result!.overall_score).toBe('number');
      expect(result!.overall_score).toBeGreaterThanOrEqual(0);
      expect(result!.signal_count).toBe(3);

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find({ where: { firm_id: firm.id } });
      expect(scores).toHaveLength(1);
      expect(scores[0].id).toBe(result!.id);
      expect(scores[0].score_version).toBe('v1.0');
      expect(scores[0].signal_count).toBe(3);

      expect(scores[0].dimension_scores).toBeDefined();
      const dimensionKeys = Object.keys(scores[0].dimension_scores!);
      expect(dimensionKeys.length).toBeGreaterThan(0);

      const evidenceRepo = getRepo(module, ScoreEvidence);
      const evidence = await evidenceRepo.find({
        where: { firm_score_id: result!.id },
      });
      expect(evidence.length).toBeGreaterThan(0);
      for (const e of evidence) {
        expect(e.firm_score_id).toBe(result!.id);
        expect(e.dimension).toBeDefined();
        expect(typeof e.weight_applied).toBe('number');
        expect(typeof e.points_contributed).toBe('number');
      }
    });

    it('should upsert an existing FirmScore instead of creating a duplicate', async () => {
      const firm = await createFirm(module);

      const firstResult = await scoringService.scoreFirm(firm.id);
      expect(firstResult).not.toBeNull();
      const firstScoreId = firstResult!.id;

      const scoreRepo = getRepo(module, FirmScore);
      const scoresAfterFirst = await scoreRepo.find({
        where: { firm_id: firm.id },
      });
      expect(scoresAfterFirst).toHaveLength(1);

      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
      });

      const secondResult = await scoringService.scoreFirm(firm.id);
      expect(secondResult).not.toBeNull();
      expect(secondResult!.id).toBe(firstScoreId);

      const scoresAfterSecond = await scoreRepo.find({
        where: { firm_id: firm.id },
      });
      expect(scoresAfterSecond).toHaveLength(1);
      expect(scoresAfterSecond[0].id).toBe(firstScoreId);
      expect(scoresAfterSecond[0].signal_count).toBe(3);

      const evidenceRepo = getRepo(module, ScoreEvidence);
      const evidence = await evidenceRepo.find({
        where: { firm_score_id: firstScoreId },
      });
      expect(evidence.length).toBeGreaterThan(0);
    });

    it('should return null and create no FirmScore when firm has no signals', async () => {
      const firm = await createFirm(module);

      const result = await scoringService.scoreFirm(firm.id);

      expect(result).toBeNull();

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find({ where: { firm_id: firm.id } });
      expect(scores).toHaveLength(0);

      const evidenceRepo = getRepo(module, ScoreEvidence);
      const allEvidence = await evidenceRepo.find();
      expect(allEvidence).toHaveLength(0);
    });

    it('should populate dimension_scores with the 6 scoring dimensions', async () => {
      const firm = await createFirm(module);
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_TEAM_GROWTH,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_HIRING,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_CONFERENCE_TALK,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
      });

      const result = await scoringService.scoreFirm(firm.id);
      expect(result).not.toBeNull();

      const dims = result!.dimension_scores;
      const expectedDimensions = [
        'ai_talent_density',
        'public_ai_activity',
        'ai_hiring_velocity',
        'thought_leadership',
        'vendor_partnerships',
        'portfolio_ai_strategy',
      ];

      for (const dim of expectedDimensions) {
        expect(dims).toHaveProperty(dim);
        const d = (dims as Record<string, any>)[dim];
        expect(d.dimension).toBe(dim);
        expect(typeof d.raw_score).toBe('number');
        expect(typeof d.weighted_score).toBe('number');
        expect(typeof d.signal_count).toBe('number');
        expect(typeof d.max_possible).toBe('number');
      }
    });

    it('should store scoring_parameters on the FirmScore', async () => {
      const firm = await createFirm(module);
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_HIRING,
      });

      const result = await scoringService.scoreFirm(firm.id);
      expect(result).not.toBeNull();

      const params = result!.scoring_parameters as any;
      expect(params).toBeDefined();
      expect(params.weights).toBeDefined();
      expect(params.thresholds).toBeDefined();
      expect(params.thresholds.min_signals_for_score).toBe(
        DEFAULT_SCORING_CONFIG.thresholds.minSignalsForScore,
      );
      expect(params.thresholds.high_confidence_threshold).toBe(
        DEFAULT_SCORING_CONFIG.thresholds.highConfidenceThreshold,
      );
    });
  });

  describe('ScoringService.scoreAllFirms', () => {
    it('should score all active firms with signals and assign ranks', async () => {
      const firmA = await createFirm(module, { name: 'Firm Alpha' });
      const firmB = await createFirm(module, { name: 'Firm Beta' });
      const firmC = await createFirm(module, { name: 'Firm Gamma' });

      await createFirmSignal(module, firmA.id, {
        signal_type: SignalType.AI_HIRING,
      });
      await createFirmSignal(module, firmA.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
      });
      await createFirmSignal(module, firmA.id, {
        signal_type: SignalType.AI_TEAM_GROWTH,
      });

      await createFirmSignal(module, firmB.id, {
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
      });
      await createFirmSignal(module, firmB.id, {
        signal_type: SignalType.AI_CONFERENCE_TALK,
      });

      await createFirmSignal(module, firmC.id, {
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
      });
      await createFirmSignal(module, firmC.id, {
        signal_type: SignalType.AI_CASE_STUDY,
      });

      const result = await scoringService.scoreAllFirms();

      expect(result.scored).toBe(3);
      expect(result.failed).toBe(0);

      const scoreRepo = getRepo(module, FirmScore);
      const allScores = await scoreRepo.find({
        order: { overall_score: 'DESC' },
      });
      expect(allScores).toHaveLength(3);

      const firmIds = allScores.map((s) => s.firm_id);
      expect(firmIds).toContain(firmA.id);
      expect(firmIds).toContain(firmB.id);
      expect(firmIds).toContain(firmC.id);

      const ranks = allScores.map((s) => s.rank!).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3]);

      for (const score of allScores) {
        expect(score.score_version).toBe('v1.0');
        expect(typeof score.overall_score).toBe('number');
        expect(score.signal_count).toBeGreaterThanOrEqual(2);
      }

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({
        where: { job_type: JobType.SCORE },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(JobStatus.COMPLETED);
      expect(jobs[0].started_at).toBeDefined();
      expect(jobs[0].completed_at).toBeDefined();
      expect((jobs[0].metadata as any).scored).toBe(3);
      expect((jobs[0].metadata as any).failed).toBe(0);
    });

    it('should return scored:0, failed:0 when no firms exist', async () => {
      const result = await scoringService.scoreAllFirms();

      expect(result).toEqual({ scored: 0, failed: 0 });

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find();
      expect(scores).toHaveLength(0);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({
        where: { job_type: JobType.SCORE },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(JobStatus.COMPLETED);
      expect((jobs[0].metadata as any).scored).toBe(0);
      expect((jobs[0].metadata as any).failed).toBe(0);
    });

    it('should skip inactive firms', async () => {
      const activeFirm = await createFirm(module, { is_active: true });
      const inactiveFirm = await createFirm(module, { is_active: false });

      await createFirmSignal(module, activeFirm.id, {
        signal_type: SignalType.AI_HIRING,
      });
      await createFirmSignal(module, inactiveFirm.id, {
        signal_type: SignalType.AI_HIRING,
      });

      const result = await scoringService.scoreAllFirms();

      expect(result.scored).toBe(1);
      expect(result.failed).toBe(0);

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find();
      expect(scores).toHaveLength(1);
      expect(scores[0].firm_id).toBe(activeFirm.id);
    });

    it('should skip firms with zero signals', async () => {
      const firmWithSignals = await createFirm(module);

      await createFirmSignal(module, firmWithSignals.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
      });

      const result = await scoringService.scoreAllFirms();

      expect(result.scored).toBe(1);
      expect(result.failed).toBe(0);

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find();
      expect(scores).toHaveLength(1);
      expect(scores[0].firm_id).toBe(firmWithSignals.id);
    });

    it('should use a custom config with different version and weights', async () => {
      const firm = await createFirm(module);
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_HIRING,
      });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_TEAM_GROWTH,
      });

      const customConfig = {
        version: 'v2.0',
        weights: {
          aiTalentDensity: 0.3,
          publicAIActivity: 0.15,
          aiHiringVelocity: 0.25,
          thoughtLeadership: 0.1,
          vendorPartnerships: 0.1,
          portfolioAIStrategy: 0.1,
        },
        thresholds: {
          minSignalsForScore: 1,
          highConfidenceThreshold: 0.8,
        },
      };

      const result = await scoringService.scoreAllFirms(customConfig);

      expect(result.scored).toBe(1);
      expect(result.failed).toBe(0);

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find({ where: { firm_id: firm.id } });
      expect(scores).toHaveLength(1);
      expect(scores[0].score_version).toBe('v2.0');
      expect(scores[0].rank).toBe(1);

      const params = scores[0].scoring_parameters as any;
      expect(params.weights.ai_talent_density).toBe(0.3);
      expect(params.weights.ai_hiring_velocity).toBe(0.25);
      expect(params.thresholds.high_confidence_threshold).toBe(0.8);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({
        where: { job_type: JobType.SCORE },
      });
      expect(jobs).toHaveLength(1);
      expect((jobs[0].metadata as any).score_version).toBe('v2.0');
    });

    it('should create ScoreEvidence records for each scored firm', async () => {
      const firm = await createFirm(module);
      const signal1 = await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_HIRING,
      });
      const signal2 = await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
      });

      await scoringService.scoreAllFirms();

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find({ where: { firm_id: firm.id } });
      expect(scores).toHaveLength(1);

      const evidenceRepo = getRepo(module, ScoreEvidence);
      const evidence = await evidenceRepo.find({
        where: { firm_score_id: scores[0].id },
      });
      expect(evidence.length).toBeGreaterThan(0);

      const signalIdsInEvidence = evidence.map((e) => e.firm_signal_id);
      const expectedSignalIds = [signal1.id, signal2.id];
      for (const id of signalIdsInEvidence) {
        expect(expectedSignalIds).toContain(id);
      }
    });

    it('should handle rescoreAllFirms delegating to scoreAllFirms', async () => {
      const firm = await createFirm(module);
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_HIRING,
      });

      const config = {
        ...DEFAULT_SCORING_CONFIG,
        version: 'v3.0',
      };

      const result = await scoringService.rescoreAllFirms(config);

      expect(result.scored).toBe(1);
      expect(result.failed).toBe(0);

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find({ where: { firm_id: firm.id } });
      expect(scores).toHaveLength(1);
      expect(scores[0].score_version).toBe('v3.0');

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({
        where: { job_type: JobType.SCORE },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(JobStatus.COMPLETED);
    });

    it('should compute correct rank ordering by overall_score DESC', async () => {
      const firm1 = await createFirm(module);
      const firm2 = await createFirm(module);
      const firm3 = await createFirm(module);

      await createFirmSignal(module, firm1.id, {
        signal_type: SignalType.AI_HIRING,
        extraction_confidence: 0.95,
      });
      await createFirmSignal(module, firm1.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
        extraction_confidence: 0.9,
      });
      await createFirmSignal(module, firm1.id, {
        signal_type: SignalType.AI_TEAM_GROWTH,
        extraction_confidence: 0.9,
      });
      await createFirmSignal(module, firm1.id, {
        signal_type: SignalType.AI_CONFERENCE_TALK,
        extraction_confidence: 0.9,
      });
      await createFirmSignal(module, firm1.id, {
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        extraction_confidence: 0.9,
      });
      await createFirmSignal(module, firm1.id, {
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
        extraction_confidence: 0.9,
      });

      await createFirmSignal(module, firm2.id, {
        signal_type: SignalType.AI_HIRING,
        extraction_confidence: 0.7,
      });
      await createFirmSignal(module, firm2.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
        extraction_confidence: 0.7,
      });

      await createFirmSignal(module, firm3.id, {
        signal_type: SignalType.AI_PODCAST,
        extraction_confidence: 0.5,
      });

      await scoringService.scoreAllFirms();

      const scoreRepo = getRepo(module, FirmScore);
      const allScores = await scoreRepo.find({
        order: { rank: 'ASC' },
      });
      expect(allScores).toHaveLength(3);

      expect(allScores[0].rank).toBe(1);
      expect(allScores[1].rank).toBe(2);
      expect(allScores[2].rank).toBe(3);

      expect(allScores[0].overall_score).toBeGreaterThanOrEqual(
        allScores[1].overall_score,
      );
      expect(allScores[1].overall_score).toBeGreaterThanOrEqual(
        allScores[2].overall_score,
      );
    });
  });
});
