import { ConfigService } from '@nestjs/config';
import { Queue, Job } from 'bullmq';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service';

jest.mock('uuid', () => ({ v7: jest.fn(() => 'mock-uuid') }));

const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue('OK'),
  decr: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};
jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedis));

describe('PipelineOrchestratorService', () => {
  let service: PipelineOrchestratorService;
  let firmRepo: jest.Mocked<Pick<Repository<any>, 'createQueryBuilder'>>;
  let signalRepo: jest.Mocked<Pick<Repository<any>, 'createQueryBuilder'>>;
  let signalCollectionQueue: jest.Mocked<Pick<Queue, 'addBulk'>>;
  let peopleCollectionQueue: jest.Mocked<Pick<Queue, 'addBulk'>>;
  let scoringQueue: jest.Mocked<Pick<Queue, 'add' | 'getJob'>>;

  function createService(overrides: Record<string, unknown> = {}) {
    const defaults: Record<string, unknown> = {
      'pipeline.autoChain': true,
      'redis.host': 'localhost',
      'redis.port': 6379,
      ...overrides,
    };
    const configGet = jest.fn(
      (key: string, fallback?: unknown) => defaults[key] ?? fallback,
    );
    const configService = { get: configGet } as unknown as ConfigService;

    firmRepo = {
      createQueryBuilder: jest.fn(),
    } as any;

    signalRepo = {
      createQueryBuilder: jest.fn(),
    } as any;

    signalCollectionQueue = {
      addBulk: jest.fn().mockResolvedValue(undefined),
    } as any;

    peopleCollectionQueue = {
      addBulk: jest.fn().mockResolvedValue(undefined),
    } as any;

    scoringQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    } as any;

    return new PipelineOrchestratorService(
      firmRepo as unknown as Repository<any>,
      signalRepo as unknown as Repository<any>,
      signalCollectionQueue as unknown as Queue,
      peopleCollectionQueue as unknown as Queue,
      scoringQueue as unknown as Queue,
      configService,
    );
  }

  function buildFirmQueryBuilder(firms: any[] = []) {
    const qb: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(firms),
    };
    (qb as any).select.mockReturnValue(qb);
    (qb as any).where.mockReturnValue(qb);
    (qb as any).andWhere.mockReturnValue(qb);
    firmRepo.createQueryBuilder.mockReturnValue(
      qb as unknown as SelectQueryBuilder<any>,
    );
    return qb;
  }

  function buildSignalQueryBuilder(result: any) {
    const qb: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(result),
    };
    signalRepo.createQueryBuilder.mockReturnValue(
      qb as unknown as SelectQueryBuilder<any>,
    );
    return qb;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.connect.mockClear();
    mockRedis.set.mockClear();
    mockRedis.decr.mockClear();
    mockRedis.del.mockClear();
  });

  describe('isAutoChainEnabled', () => {
    it('should return true when pipeline.autoChain is true', () => {
      service = createService({ 'pipeline.autoChain': true });
      expect(service.isAutoChainEnabled()).toBe(true);
    });

    it('should return false when pipeline.autoChain is false', () => {
      service = createService({ 'pipeline.autoChain': false });
      expect(service.isAutoChainEnabled()).toBe(false);
    });
  });

  describe('triggerCollectionForAllFirms', () => {
    it('should return zero counts when no firms need collection', async () => {
      service = createService();
      buildFirmQueryBuilder([]);

      const result = await service.triggerCollectionForAllFirms();

      expect(result).toEqual({
        firmCount: 0,
        signalJobCount: 0,
        peopleJobCount: 0,
      });
      expect(signalCollectionQueue.addBulk).not.toHaveBeenCalled();
      expect(peopleCollectionQueue.addBulk).not.toHaveBeenCalled();
    });

    it('should enqueue bulk jobs for firms needing collection', async () => {
      service = createService();
      const firms = [
        { id: 'firm-1', name: 'Firm One' },
        { id: 'firm-2', name: 'Firm Two' },
      ];
      buildFirmQueryBuilder(firms);

      const result = await service.triggerCollectionForAllFirms();

      expect(result).toEqual({
        firmCount: 2,
        signalJobCount: 2,
        peopleJobCount: 2,
      });

      expect(signalCollectionQueue.addBulk).toHaveBeenCalledWith(
        firms.map((firm) =>
          expect.objectContaining({
            name: 'collect-signals',
            data: { firmId: firm.id, firmName: firm.name },
          }),
        ),
      );

      expect(peopleCollectionQueue.addBulk).toHaveBeenCalledWith(
        firms.map((firm) =>
          expect.objectContaining({
            name: 'collect-people',
            data: { firmId: firm.id, firmName: firm.name },
          }),
        ),
      );
    });
  });

  describe('trackExtractionBatch', () => {
    it('should be a no-op when autoChain is disabled', async () => {
      service = createService({ 'pipeline.autoChain': false });

      await service.trackExtractionBatch('firm-1', 5);

      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should set a Redis key with count and TTL when autoChain is enabled', async () => {
      service = createService({ 'pipeline.autoChain': true });

      await service.trackExtractionBatch('firm-1', 5);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'pipeline:firm:firm-1:pending_extractions',
        5,
        'EX',
        86400,
      );
    });
  });

  describe('onExtractionComplete', () => {
    it('should be a no-op when autoChain is disabled', async () => {
      service = createService({ 'pipeline.autoChain': false });

      await service.onExtractionComplete('firm-1');

      expect(mockRedis.decr).not.toHaveBeenCalled();
    });

    it('should only decrement when remaining > 0', async () => {
      service = createService();
      mockRedis.decr.mockResolvedValue(3);

      await service.onExtractionComplete('firm-1');

      expect(mockRedis.decr).toHaveBeenCalledWith(
        'pipeline:firm:firm-1:pending_extractions',
      );
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(scoringQueue.add).not.toHaveBeenCalled();
    });

    it('should delete key and trigger scoring when remaining <= 0', async () => {
      service = createService();
      mockRedis.decr.mockResolvedValue(0);

      await service.onExtractionComplete('firm-1');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'pipeline:firm:firm-1:pending_extractions',
      );
      expect(scoringQueue.add).toHaveBeenCalledWith(
        'score',
        { firmId: 'firm-1' },
        { jobId: 'score-firm-firm-1' },
      );
    });

    it('should delete key and trigger scoring when remaining is negative', async () => {
      service = createService();
      mockRedis.decr.mockResolvedValue(-1);

      await service.onExtractionComplete('firm-1');

      expect(mockRedis.del).toHaveBeenCalled();
      expect(scoringQueue.add).toHaveBeenCalled();
    });
  });

  describe('onCollectionCompleteNoExtractions', () => {
    it('should be a no-op when autoChain is disabled', async () => {
      service = createService({ 'pipeline.autoChain': false });

      await service.onCollectionCompleteNoExtractions('firm-1');

      expect(signalRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should trigger scoring when firm has existing signals', async () => {
      service = createService();
      buildSignalQueryBuilder({ '1': 1 });

      await service.onCollectionCompleteNoExtractions('firm-1');

      expect(scoringQueue.add).toHaveBeenCalledWith(
        'score',
        { firmId: 'firm-1' },
        { jobId: 'score-firm-firm-1' },
      );
    });

    it('should skip scoring when firm has no signals', async () => {
      service = createService();
      buildSignalQueryBuilder(undefined);

      await service.onCollectionCompleteNoExtractions('firm-1');

      expect(scoringQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('triggerScoringForFirm', () => {
    it('should skip when an existing job is in waiting state', async () => {
      service = createService();
      const existingJob = {
        getState: jest.fn().mockResolvedValue('waiting'),
      } as unknown as Job;
      scoringQueue.getJob.mockResolvedValue(existingJob);

      await service.triggerScoringForFirm('firm-1');

      expect(scoringQueue.add).not.toHaveBeenCalled();
    });

    it('should skip when an existing job is in active state', async () => {
      service = createService();
      const existingJob = {
        getState: jest.fn().mockResolvedValue('active'),
      } as unknown as Job;
      scoringQueue.getJob.mockResolvedValue(existingJob);

      await service.triggerScoringForFirm('firm-1');

      expect(scoringQueue.add).not.toHaveBeenCalled();
    });

    it('should skip when an existing job is in delayed state', async () => {
      service = createService();
      const existingJob = {
        getState: jest.fn().mockResolvedValue('delayed'),
      } as unknown as Job;
      scoringQueue.getJob.mockResolvedValue(existingJob);

      await service.triggerScoringForFirm('firm-1');

      expect(scoringQueue.add).not.toHaveBeenCalled();
    });

    it('should add a new scoring job when existing job is completed', async () => {
      service = createService();
      const existingJob = {
        getState: jest.fn().mockResolvedValue('completed'),
      } as unknown as Job;
      scoringQueue.getJob.mockResolvedValue(existingJob);

      await service.triggerScoringForFirm('firm-1');

      expect(scoringQueue.add).toHaveBeenCalledWith(
        'score',
        { firmId: 'firm-1' },
        { jobId: 'score-firm-firm-1' },
      );
    });

    it('should add a new scoring job when no existing job is found', async () => {
      service = createService();
      scoringQueue.getJob.mockResolvedValue(null);

      await service.triggerScoringForFirm('firm-1');

      expect(scoringQueue.add).toHaveBeenCalledWith(
        'score',
        { firmId: 'firm-1' },
        { jobId: 'score-firm-firm-1' },
      );
    });
  });
});
