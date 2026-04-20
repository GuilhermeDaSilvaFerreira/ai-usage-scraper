import { SignalType } from '../../../common/enums/signal-type.enum';
import { JobType, JobStatus } from '../../../common/enums/job-type.enum';
import {
  DEFAULT_SCORING_CONFIG,
  ScoringConfig,
} from '../../../common/interfaces/scoring.interfaces';
import { ScoringService } from './scoring.service';
import { ScoringEngine } from './scoring-engine';

function createMockSignal(overrides: Partial<any> = {}): any {
  return {
    id: 'sig-1',
    firm_id: 'firm-1',
    signal_type: SignalType.AI_HIRING,
    signal_data: {},
    extraction_confidence: 0.8,
    collected_at: new Date(),
    ...overrides,
  };
}

function createMockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: any) => ({ id: 'generated-id', ...data })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
  };
}

describe('ScoringService', () => {
  let service: ScoringService;
  let firmRepo: ReturnType<typeof createMockRepo>;
  let signalRepo: ReturnType<typeof createMockRepo>;
  let scoreRepo: ReturnType<typeof createMockRepo>;
  let evidenceRepo: ReturnType<typeof createMockRepo>;
  let jobRepo: ReturnType<typeof createMockRepo>;
  let scoringEngine: { scoreFirm: jest.Mock };

  beforeEach(() => {
    firmRepo = createMockRepo();
    signalRepo = createMockRepo();
    scoreRepo = createMockRepo();
    evidenceRepo = createMockRepo();
    jobRepo = createMockRepo();
    scoringEngine = { scoreFirm: jest.fn() };

    service = new ScoringService(
      firmRepo as any,
      signalRepo as any,
      scoreRepo as any,
      evidenceRepo as any,
      jobRepo as any,
      scoringEngine as unknown as ScoringEngine,
    );
  });

  describe('scoreFirm', () => {
    it('should return null when signals are below minSignalsForScore threshold', async () => {
      signalRepo.find.mockResolvedValue([]);

      const result = await service.scoreFirm('firm-1');

      expect(result).toBeNull();
      expect(scoringEngine.scoreFirm).not.toHaveBeenCalled();
    });

    it('should return null for custom config with higher threshold', async () => {
      signalRepo.find.mockResolvedValue([createMockSignal()]);
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        thresholds: {
          min_signals_for_score: 5,
          high_confidence_threshold: 0.7,
        },
      };

      const result = await service.scoreFirm('firm-1', config);

      expect(result).toBeNull();
    });

    it('should create a new FirmScore when no existing score exists', async () => {
      const signals = [createMockSignal()];
      signalRepo.find.mockResolvedValue(signals);
      scoreRepo.findOne.mockResolvedValue(null);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 75,
        dimensions: [
          {
            dimension: 'ai_talent_density',
            rawScore: 80,
            weightedScore: 20,
            signalCount: 1,
            maxPossible: 100,
          },
        ],
        signalCount: 1,
        evidence: [
          {
            signalId: 'sig-1',
            dimension: 'ai_talent_density',
            weightApplied: 15,
            pointsContributed: 15,
            reasoning: 'Senior hire detected',
          },
        ],
      });

      const result = await service.scoreFirm('firm-1');

      expect(result).not.toBeNull();
      expect(scoreRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firm_id: 'firm-1',
          score_version: DEFAULT_SCORING_CONFIG.version,
          overall_score: 75,
          signal_count: 1,
        }),
      );
      expect(scoreRepo.save).toHaveBeenCalled();
      expect(evidenceRepo.create).toHaveBeenCalled();
      expect(evidenceRepo.save).toHaveBeenCalled();
    });

    it('should update existing FirmScore and delete old evidence', async () => {
      const signals = [createMockSignal()];
      signalRepo.find.mockResolvedValue(signals);

      const existingScore = {
        id: 'existing-score-id',
        firm_id: 'firm-1',
        score_version: 'v1.0',
        overall_score: 50,
        dimension_scores: {},
        signal_count: 1,
        scoring_parameters: {},
        scored_at: new Date('2025-01-01'),
      };
      scoreRepo.findOne.mockResolvedValue(existingScore);

      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 80,
        dimensions: [
          {
            dimension: 'ai_talent_density',
            rawScore: 90,
            weightedScore: 22.5,
            signalCount: 1,
            maxPossible: 100,
          },
        ],
        signalCount: 1,
        evidence: [
          {
            signalId: 'sig-1',
            dimension: 'ai_talent_density',
            weightApplied: 15,
            pointsContributed: 15,
            reasoning: 'Updated score',
          },
        ],
      });

      const result = await service.scoreFirm('firm-1');

      expect(evidenceRepo.delete).toHaveBeenCalledWith({
        firm_score_id: 'existing-score-id',
      });
      expect(existingScore.overall_score).toBe(80);
      expect(scoreRepo.save).toHaveBeenCalledWith(existingScore);
      expect(result).toBe(existingScore);
    });

    it('should call scoringEngine.scoreFirm with signals and config', async () => {
      const signals = [createMockSignal(), createMockSignal({ id: 's2' })];
      signalRepo.find.mockResolvedValue(signals);
      scoreRepo.findOne.mockResolvedValue(null);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 50,
        dimensions: [],
        signalCount: 2,
        evidence: [],
      });

      await service.scoreFirm('firm-1');

      expect(scoringEngine.scoreFirm).toHaveBeenCalledWith(
        signals,
        DEFAULT_SCORING_CONFIG,
      );
    });

    it('should not save evidence when all evidence entries have empty signalIds', async () => {
      signalRepo.find.mockResolvedValue([createMockSignal()]);
      scoreRepo.findOne.mockResolvedValue(null);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 10,
        dimensions: [],
        signalCount: 1,
        evidence: [
          {
            signalId: '',
            dimension: 'ai_talent_density',
            weightApplied: 5,
            pointsContributed: 5,
            reasoning: 'Empty signal ID',
          },
        ],
      });

      await service.scoreFirm('firm-1');

      expect(evidenceRepo.save).not.toHaveBeenCalled();
    });

    it('should compute ranks after scoring a single firm so rank is never left null', async () => {
      signalRepo.find.mockResolvedValue([createMockSignal()]);
      scoreRepo.findOne.mockResolvedValue(null);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 42,
        dimensions: [],
        signalCount: 1,
        evidence: [],
      });

      await service.scoreFirm('firm-1');

      expect(scoreRepo.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE\s+firm_scores[\s\S]+RANK\(\)\s+OVER/i),
        [DEFAULT_SCORING_CONFIG.version],
      );
    });

    it('should compute ranks even when updating an existing score', async () => {
      signalRepo.find.mockResolvedValue([createMockSignal()]);
      scoreRepo.findOne.mockResolvedValue({
        id: 'existing-id',
        firm_id: 'firm-1',
        score_version: 'v1.0',
        overall_score: 0,
        dimension_scores: {},
        signal_count: 0,
        scoring_parameters: {},
        scored_at: new Date('2025-01-01'),
      });
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 75,
        dimensions: [],
        signalCount: 1,
        evidence: [],
      });

      await service.scoreFirm('firm-1');

      expect(scoreRepo.query).toHaveBeenCalledWith(expect.any(String), [
        DEFAULT_SCORING_CONFIG.version,
      ]);
    });

    it('should save evidence only for entries with non-empty signalIds', async () => {
      signalRepo.find.mockResolvedValue([createMockSignal()]);
      scoreRepo.findOne.mockResolvedValue(null);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 10,
        dimensions: [],
        signalCount: 1,
        evidence: [
          {
            signalId: 'sig-1',
            dimension: 'ai_talent_density',
            weightApplied: 5,
            pointsContributed: 5,
            reasoning: 'Valid',
          },
          {
            signalId: '',
            dimension: 'ai_talent_density',
            weightApplied: 5,
            pointsContributed: 0,
            reasoning: 'Skipped',
          },
        ],
      });

      await service.scoreFirm('firm-1');

      expect(evidenceRepo.create).toHaveBeenCalledTimes(1);
      expect(evidenceRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ firm_signal_id: 'sig-1' }),
        ]),
      );
    });
  });

  describe('scoreAllFirms', () => {
    function setupQueryBuilder(firms: any[]) {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(firms),
      };
      firmRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('should create a ScrapeJob with SCORE type and RUNNING status', async () => {
      setupQueryBuilder([]);

      await service.scoreAllFirms();

      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: JobType.SCORE,
          status: JobStatus.RUNNING,
        }),
      );
      expect(jobRepo.save).toHaveBeenCalled();
    });

    it('should return {scored:0, failed:0} when no firms have signals', async () => {
      setupQueryBuilder([]);

      const result = await service.scoreAllFirms();

      expect(result).toEqual({ scored: 0, failed: 0 });
    });

    it('should mark job COMPLETED with skipped_reason when no firms', async () => {
      setupQueryBuilder([]);

      await service.scoreAllFirms();

      const savedJob = jobRepo.save.mock.calls[1][0];
      expect(savedJob.status).toBe(JobStatus.COMPLETED);
      expect(savedJob.metadata).toEqual(
        expect.objectContaining({
          scored: 0,
          failed: 0,
          skipped_reason: 'no_signals',
        }),
      );
    });

    it('should score each firm and count successes', async () => {
      setupQueryBuilder([{ id: 'f1' }, { id: 'f2' }]);

      const signals = [createMockSignal()];
      signalRepo.find.mockResolvedValue(signals);
      scoreRepo.findOne.mockResolvedValue(null);
      scoreRepo.find.mockResolvedValue([]);

      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 50,
        dimensions: [],
        signalCount: 1,
        evidence: [],
      });

      const result = await service.scoreAllFirms();

      expect(result.scored).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle individual firm scoring failures gracefully', async () => {
      setupQueryBuilder([{ id: 'f1' }, { id: 'f2' }]);

      let callCount = 0;
      signalRepo.find.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('DB connection lost'));
        }
        return Promise.resolve([createMockSignal()]);
      });
      scoreRepo.findOne.mockResolvedValue(null);
      scoreRepo.find.mockResolvedValue([]);

      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 50,
        dimensions: [],
        signalCount: 1,
        evidence: [],
      });

      const result = await service.scoreAllFirms();

      expect(result.scored).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should compute ranks after scoring all firms', async () => {
      setupQueryBuilder([{ id: 'f1' }]);

      signalRepo.find.mockResolvedValue([createMockSignal()]);
      scoreRepo.findOne.mockResolvedValue(null);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 50,
        dimensions: [],
        signalCount: 1,
        evidence: [],
      });

      await service.scoreAllFirms();

      expect(scoreRepo.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE\s+firm_scores[\s\S]+RANK\(\)\s+OVER/i),
        [DEFAULT_SCORING_CONFIG.version],
      );
    });

    it('should mark job COMPLETED with scored/failed metadata on success', async () => {
      setupQueryBuilder([{ id: 'f1' }]);

      signalRepo.find.mockResolvedValue([createMockSignal()]);
      scoreRepo.findOne.mockResolvedValue(null);
      scoreRepo.find.mockResolvedValue([]);
      scoringEngine.scoreFirm.mockReturnValue({
        overallScore: 50,
        dimensions: [],
        signalCount: 1,
        evidence: [],
      });

      await service.scoreAllFirms();

      const lastSave =
        jobRepo.save.mock.calls[jobRepo.save.mock.calls.length - 1][0];
      expect(lastSave.status).toBe(JobStatus.COMPLETED);
      expect(lastSave.metadata).toEqual(
        expect.objectContaining({ scored: 1, failed: 0 }),
      );
    });

    it('should mark job FAILED and rethrow on outer error', async () => {
      const error = new Error('QueryBuilder failure');
      firmRepo.createQueryBuilder.mockImplementation(() => {
        throw error;
      });

      await expect(service.scoreAllFirms()).rejects.toThrow(
        'QueryBuilder failure',
      );

      const lastSave =
        jobRepo.save.mock.calls[jobRepo.save.mock.calls.length - 1][0];
      expect(lastSave.status).toBe(JobStatus.FAILED);
      expect(lastSave.error_message).toContain('QueryBuilder failure');
    });

    it('should pass queueJobId to job metadata', async () => {
      setupQueryBuilder([]);

      await service.scoreAllFirms(DEFAULT_SCORING_CONFIG, 'queue-123');

      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          queue_job_id: 'queue-123',
        }),
      );
    });

    it('should set queue_job_id to null when queueJobId is not provided', async () => {
      setupQueryBuilder([]);

      await service.scoreAllFirms();

      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          queue_job_id: null,
        }),
      );
    });

    it('should not count firms that return null from scoreFirm (below threshold)', async () => {
      setupQueryBuilder([{ id: 'f1' }]);

      signalRepo.find.mockResolvedValue([]);

      const result = await service.scoreAllFirms();

      expect(result.scored).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('rescoreAllFirms', () => {
    it('should delegate to scoreAllFirms with the given config', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      firmRepo.createQueryBuilder.mockReturnValue(qb);

      const config: ScoringConfig = {
        version: 'v2.0',
        weights: DEFAULT_SCORING_CONFIG.weights,
        thresholds: DEFAULT_SCORING_CONFIG.thresholds,
      };

      const result = await service.rescoreAllFirms(config);

      expect(result).toEqual({ scored: 0, failed: 0 });
      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { score_version: 'v2.0' },
        }),
      );
    });
  });
});
