import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { truncateAllTables, getRepo } from './setup/test-db';
import {
  createFirm,
  createFirmSignal,
  createScrapeJob,
  SignalType,
  ExtractionMethod,
  JobType,
  JobStatus,
} from './setup/fixtures';
import { ScrapeJob } from '../src/database/entities/scrape-job.entity';
import { FirmScore } from '../src/database/entities/firm-score.entity';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

describe('PipelineController (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let server: App;

  const QUEUE_NAMES = [
    'seeding',
    'signal-collection',
    'people-collection',
    'extraction',
    'scoring',
    'outreach-campaigns',
  ];

  beforeAll(async () => {
    const ctx: TestContext = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    for (const name of QUEUE_NAMES) {
      const queue = module.get<Queue>(getQueueToken(name));
      await queue.obliterate({ force: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await truncateAllTables(module);
  });

  describe('POST /api/pipeline/seed', () => {
    it('should queue a seeding job and return job_id', async () => {
      const res = await request(server)
        .post('/api/pipeline/seed')
        .send({ target_firm_count: 50 })
        .expect(201);

      expect(res.body).toMatchObject({
        message: expect.stringContaining('50'),
        job_id: expect.any(String),
        target_firm_count: 50,
      });
    });

    it('should reject when target_firm_count is missing', async () => {
      await request(server).post('/api/pipeline/seed').send({}).expect(400);
    });

    it('should reject when target_firm_count is 0', async () => {
      await request(server)
        .post('/api/pipeline/seed')
        .send({ target_firm_count: 0 })
        .expect(400);
    });

    it('should reject when target_firm_count is negative', async () => {
      await request(server)
        .post('/api/pipeline/seed')
        .send({ target_firm_count: -5 })
        .expect(400);
    });

    it('should reject when target_firm_count is not a number', async () => {
      await request(server)
        .post('/api/pipeline/seed')
        .send({ target_firm_count: 'abc' })
        .expect(400);
    });
  });

  describe('POST /api/pipeline/collect', () => {
    it('should return zeroes when no firms exist', async () => {
      const res = await request(server)
        .post('/api/pipeline/collect')
        .expect(201);

      expect(res.body).toMatchObject({
        message: expect.any(String),
        firm_count: 0,
        signal_job_count: 0,
        people_job_count: 0,
      });
    });

    it('should return zeroes when all firms were collected recently', async () => {
      await createFirm(module, {
        is_active: true,
        last_collected_at: new Date(),
      });

      const res = await request(server)
        .post('/api/pipeline/collect')
        .expect(201);

      expect(res.body.firm_count).toBe(0);
    });

    it('should queue jobs for active firms that need collection', async () => {
      const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await createFirm(module, {
        is_active: true,
        last_collected_at: staleDate,
      });
      await createFirm(module, {
        is_active: true,
        last_collected_at: null as any,
      });

      const res = await request(server)
        .post('/api/pipeline/collect')
        .expect(201);

      expect(res.body.firm_count).toBe(2);
      expect(res.body.signal_job_count).toBe(2);
      expect(res.body.people_job_count).toBe(2);
    });

    it('should skip inactive firms', async () => {
      await createFirm(module, { is_active: false });

      const res = await request(server)
        .post('/api/pipeline/collect')
        .expect(201);

      expect(res.body.firm_count).toBe(0);
    });
  });

  describe('POST /api/pipeline/:firm_id/collect', () => {
    it('should queue signal and people collection jobs for a firm', async () => {
      const firm = await createFirm(module);

      const res = await request(server)
        .post(`/api/pipeline/${firm.id}/collect`)
        .expect(201);

      expect(res.body).toMatchObject({
        message: expect.stringContaining(firm.id),
        signal_job_id: expect.any(String),
        people_job_id: expect.any(String),
      });
      expect(res.body.signal_job_id).not.toBe(res.body.people_job_id);
    });

    it('should accept an arbitrary string as firm_id', async () => {
      const res = await request(server)
        .post('/api/pipeline/not-a-uuid/collect')
        .expect(201);

      expect(res.body.signal_job_id).toBeDefined();
      expect(res.body.people_job_id).toBeDefined();
    });
  });

  describe('POST /api/pipeline/score', () => {
    it('should queue a scoring job with default config', async () => {
      const res = await request(server)
        .post('/api/pipeline/score')
        .send({})
        .expect(201);

      expect(res.body).toMatchObject({
        message: expect.stringContaining('v1.0'),
        job_id: expect.any(String),
        config: expect.objectContaining({
          version: 'v1.0',
          weights: expect.any(Object),
          thresholds: expect.any(Object),
        }),
      });
    });

    it('should accept custom scoring config', async () => {
      const res = await request(server)
        .post('/api/pipeline/score')
        .send({
          version: 'v2.0-test',
          weights: { ai_talent_density: 0.5 },
          thresholds: { min_signals_for_score: 5 },
        })
        .expect(201);

      expect(res.body.config.version).toBe('v2.0-test');
      expect(res.body.config.weights.aiTalentDensity).toBe(0.5);
      expect(res.body.config.thresholds.minSignalsForScore).toBe(5);
    });
  });

  describe('POST /api/pipeline/rescore', () => {
    it('should return scored:0 and failed:0 when no firms exist', async () => {
      const res = await request(server)
        .post('/api/pipeline/rescore')
        .send({})
        .expect(201);

      expect(res.body).toMatchObject({
        message: expect.any(String),
        scored: 0,
        failed: 0,
      });
    });

    it('should score a firm with signals and persist results', async () => {
      const firm = await createFirm(module, { is_active: true });
      await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
        extraction_method: ExtractionMethod.HEURISTIC,
        extraction_confidence: 0.9,
      });

      const res = await request(server)
        .post('/api/pipeline/rescore')
        .send({ version: 'e2e-test' })
        .expect(201);

      expect(res.body.scored).toBeGreaterThanOrEqual(1);

      const scoreRepo = getRepo(module, FirmScore);
      const scores = await scoreRepo.find({ where: { firm_id: firm.id } });
      expect(scores.length).toBeGreaterThanOrEqual(1);

      const matchingScore = scores.find((s) => s.score_version === 'e2e-test');
      expect(matchingScore).toBeDefined();

      const jobRepo = getRepo(module, ScrapeJob);
      const scoreJobs = await jobRepo.find({
        where: { job_type: JobType.SCORE },
      });
      expect(scoreJobs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/pipeline/status', () => {
    it('should return queue counts and empty recent_jobs', async () => {
      const res = await request(server).get('/api/pipeline/status').expect(200);

      expect(res.body.queues).toBeDefined();

      const queueNames = [
        'seeding',
        'signal_collection',
        'people_collection',
        'extraction',
        'scoring',
        'outreach_campaigns',
      ];
      for (const name of queueNames) {
        expect(res.body.queues[name]).toEqual(
          expect.objectContaining({
            waiting: expect.any(Number),
            active: expect.any(Number),
            completed: expect.any(Number),
            failed: expect.any(Number),
            delayed: expect.any(Number),
          }),
        );
      }

      expect(res.body.recent_jobs).toEqual(expect.any(Array));
    });

    it('should include scrape jobs in recent_jobs', async () => {
      const firm = await createFirm(module);
      await createScrapeJob(module, {
        firm_id: firm.id,
        job_type: JobType.COLLECT,
        status: JobStatus.COMPLETED,
      });
      await createScrapeJob(module, {
        firm_id: firm.id,
        job_type: JobType.SCORE,
        status: JobStatus.FAILED,
        error_message: 'test error',
      });

      const res = await request(server).get('/api/pipeline/status').expect(200);

      expect(res.body.recent_jobs.length).toBe(2);

      const types = res.body.recent_jobs.map((j: any) => j.type);
      expect(types).toContain(JobType.COLLECT);
      expect(types).toContain(JobType.SCORE);

      const failedJob = res.body.recent_jobs.find(
        (j: any) => j.status === JobStatus.FAILED,
      );
      expect(failedJob).toBeDefined();
      expect(failedJob.error_message).toBe('test error');
    });

    it('should limit recent_jobs to 20 entries', async () => {
      const firm = await createFirm(module);
      const jobs = Array.from({ length: 25 }, () =>
        createScrapeJob(module, {
          firm_id: firm.id,
          job_type: JobType.COLLECT,
          status: JobStatus.COMPLETED,
        }),
      );
      await Promise.all(jobs);

      const res = await request(server).get('/api/pipeline/status').expect(200);

      expect(res.body.recent_jobs.length).toBe(20);
    });
  });
});
