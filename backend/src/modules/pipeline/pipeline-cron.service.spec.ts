import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PipelineCronService } from './pipeline-cron.service';

jest.mock('uuid', () => ({ v7: jest.fn(() => 'mock-uuid') }));

const mockCronJobInstance = { start: jest.fn() };
jest.mock('cron', () => ({
  CronJob: {
    from: jest.fn(() => mockCronJobInstance),
  },
}));

describe('PipelineCronService', () => {
  let service: PipelineCronService;
  let schedulerRegistry: jest.Mocked<Pick<SchedulerRegistry, 'addCronJob'>>;
  let seedingQueue: jest.Mocked<Pick<Queue, 'add'>>;
  let configGet: jest.Mock;

  function createService(overrides: Record<string, unknown> = {}) {
    const defaults: Record<string, unknown> = {
      'pipeline.cronSchedule': '0 0 * * 0',
      'pipeline.seedTarget': 50,
      ...overrides,
    };

    configGet = jest.fn(
      (key: string, fallback?: unknown) => defaults[key] ?? fallback,
    );
    const configService = { get: configGet } as unknown as ConfigService;

    schedulerRegistry = {
      addCronJob: jest.fn(),
    } as any;

    seedingQueue = { add: jest.fn().mockResolvedValue(undefined) } as any;

    return new PipelineCronService(
      schedulerRegistry as unknown as SchedulerRegistry,
      configService,
      seedingQueue as unknown as Queue,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should create a CronJob with the configured schedule and register it', () => {
      service = createService();
      const { CronJob } = jest.requireMock('cron');

      service.onModuleInit();

      expect(CronJob.from).toHaveBeenCalledWith(
        expect.objectContaining({
          cronTime: '0 0 * * 0',
          start: true,
        }),
      );
      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        'pipeline-full-run',
        mockCronJobInstance,
      );
    });

    it('should use a custom cron schedule from config', () => {
      service = createService({ 'pipeline.cronSchedule': '*/5 * * * *' });
      const { CronJob } = jest.requireMock('cron');

      service.onModuleInit();

      expect(CronJob.from).toHaveBeenCalledWith(
        expect.objectContaining({ cronTime: '*/5 * * * *' }),
      );
    });
  });

  describe('runFullPipeline', () => {
    it('should enqueue a seeding job with correct data and jobId', async () => {
      service = createService();

      await service.runFullPipeline();

      expect(seedingQueue.add).toHaveBeenCalledWith(
        'seed',
        { targetFirmCount: 50 },
        { jobId: 'mock-uuid', attempts: 1, removeOnComplete: false },
      );
    });

    it('should use custom seedTarget from config', async () => {
      service = createService({ 'pipeline.seedTarget': 100 });

      await service.runFullPipeline();

      expect(seedingQueue.add).toHaveBeenCalledWith(
        'seed',
        { targetFirmCount: 100 },
        expect.objectContaining({ jobId: 'mock-uuid' }),
      );
    });

    it('should invoke the cron onTick callback which triggers runFullPipeline', async () => {
      service = createService();
      const { CronJob } = jest.requireMock('cron');

      service.onModuleInit();

      const onTick = CronJob.from.mock.calls[0][0].onTick;
      await onTick();

      expect(seedingQueue.add).toHaveBeenCalledTimes(1);
    });
  });
});
