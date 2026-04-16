import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { createTestApp, TestContext } from '../setup/test-app';
import { truncateAllTables, getRepo } from '../setup/test-db';
import { createFirm, JobType, JobStatus } from '../setup/fixtures';
import { Firm } from '../../src/database/entities/firm.entity';
import { DataSource } from '../../src/database/entities/data-source.entity';
import { ScrapeJob } from '../../src/database/entities/scrape-job.entity';
import { SeedingService } from '../../src/modules/pipeline/seeding/seeding.service';
import { PublicRankingsSource } from '../../src/modules/pipeline/seeding/sources/public-rankings.source';

jest.mock('axios', () => {
  const mockAxios: any = jest.fn().mockResolvedValue({ data: '', status: 200 });
  mockAxios.get = jest.fn().mockResolvedValue({ data: '', status: 200 });
  mockAxios.create = jest.fn(() => mockAxios);
  mockAxios.defaults = { headers: { common: {} } };
  return { __esModule: true, default: mockAxios };
});

describe('SeedingService (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let ctx: TestContext;
  let seedingService: SeedingService;
  let publicRankingsSource: PublicRankingsSource;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    seedingService = module.get(SeedingService);
    publicRankingsSource = module.get(PublicRankingsSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
    jest.clearAllMocks();
    ctx.mocks.secEdgar.searchFirms.mockResolvedValue([]);
    ctx.mocks.secEdgar.searchInvestmentAdvisers.mockResolvedValue([]);
    ctx.mocks.secEdgar.getCompanyByName.mockResolvedValue([]);
    ctx.mocks.secEdgar.getCompanyByCik.mockResolvedValue(null);
    ctx.mocks.exa.search.mockResolvedValue([]);
    ctx.mocks.exa.findSimilar.mockResolvedValue([]);
  });

  describe('seed with target already met', () => {
    it('should skip discovery and return firmsCreated:0', async () => {
      for (let i = 0; i < 5; i++) {
        await createFirm(module);
      }

      const result = await seedingService.seed(5);

      expect(result.firmsCreated).toBe(0);
      expect(result.firmsInDb).toBe(5);
      expect(result.rounds).toBe(0);
      expect(result.targetFirmCount).toBe(5);
    });

    it('should create a ScrapeJob with type SEED and status COMPLETED', async () => {
      for (let i = 0; i < 5; i++) {
        await createFirm(module);
      }

      await seedingService.seed(5);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { job_type: JobType.SEED } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(JobStatus.COMPLETED);
      expect(jobs[0].started_at).toBeInstanceOf(Date);
      expect(jobs[0].completed_at).toBeInstanceOf(Date);
      expect(jobs[0].metadata).toMatchObject({
        target_firm_count: 5,
        firms_created: 0,
      });
    });

    it('should still run enrichment when target is already met', async () => {
      for (let i = 0; i < 3; i++) {
        await createFirm(module);
      }

      const result = await seedingService.seed(3);

      expect(result.firmsCreated).toBe(0);
      expect(result.firmsEnriched).toBeDefined();
    });
  });

  describe('seed with empty DB and all sources returning empty', () => {
    let discoverSpy: jest.SpyInstance;

    beforeEach(() => {
      discoverSpy = jest
        .spyOn(publicRankingsSource, 'discoverFirms')
        .mockResolvedValue([]);
    });

    afterEach(() => {
      discoverSpy.mockRestore();
    });

    it('should return firmsCreated:0 when no source yields candidates', async () => {
      const result = await seedingService.seed(10);

      expect(result.firmsCreated).toBe(0);
      expect(result.rounds).toBeGreaterThan(0);
      expect(result.targetFirmCount).toBe(10);
    });

    it('should create a COMPLETED ScrapeJob even with zero discoveries', async () => {
      await seedingService.seed(10);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { job_type: JobType.SEED } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(JobStatus.COMPLETED);
      expect(jobs[0].metadata).toMatchObject({
        target_firm_count: 10,
        firms_created: 0,
      });
      expect((jobs[0].metadata as any).rounds).toBeGreaterThan(0);
    });

    it('should not create any Firm records', async () => {
      await seedingService.seed(10);

      const firmRepo = getRepo(module, Firm);
      const count = await firmRepo.count();
      expect(count).toBe(0);
    });
  });

  describe('seed with SEC source returning candidates', () => {
    let discoverSpy: jest.SpyInstance;

    beforeEach(() => {
      discoverSpy = jest
        .spyOn(publicRankingsSource, 'discoverFirms')
        .mockResolvedValue([]);
    });

    afterEach(() => {
      discoverSpy.mockRestore();
    });

    it('should create Firm records from SEC Edgar candidates', async () => {
      const edgarFirms = [
        {
          cik: '123',
          name: 'Test PE Firm Alpha',
          entityType: 'IA',
          sic: '',
          sicDescription: '',
          addresses: {
            business: { street: '', city: 'New York', state: 'NY', zip: '' },
          },
          filings: [],
        },
        {
          cik: '456',
          name: 'Test PE Firm Beta',
          entityType: 'IA',
          sic: '',
          sicDescription: '',
          addresses: {
            business: { street: '', city: 'Chicago', state: 'IL', zip: '' },
          },
          filings: [],
        },
      ];
      ctx.mocks.secEdgar.searchInvestmentAdvisers.mockResolvedValue(edgarFirms);

      const result = await seedingService.seed(10);

      expect(result.firmsCreated).toBeGreaterThanOrEqual(2);

      const firmRepo = getRepo(module, Firm);
      const firms = await firmRepo.find();
      expect(firms.length).toBeGreaterThanOrEqual(2);

      const names = firms.map((f) => f.name);
      expect(names).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Test PE Firm Alpha'),
          expect.stringContaining('Test PE Firm Beta'),
        ]),
      );
    });

    it('should persist DataSource records for seeded firms', async () => {
      ctx.mocks.secEdgar.searchInvestmentAdvisers.mockResolvedValue([
        {
          cik: '789',
          name: 'DataSource Check Firm',
          entityType: 'IA',
          sic: '',
          sicDescription: '',
          addresses: {
            business: { street: '', city: 'Boston', state: 'MA', zip: '' },
          },
          filings: [],
        },
      ]);

      await seedingService.seed(10);

      const dsRepo = getRepo(module, DataSource);
      const sources = await dsRepo.find();
      const seedingSources = sources.filter(
        (ds) =>
          ds.title?.includes('Seeding') &&
          ds.title?.includes('DataSource Check Firm'),
      );
      expect(seedingSources.length).toBeGreaterThanOrEqual(1);
    });

    it('should store headquarters from SEC data on the Firm', async () => {
      ctx.mocks.secEdgar.searchInvestmentAdvisers.mockResolvedValue([
        {
          cik: '321',
          name: 'HQ Test PE Firm',
          entityType: 'IA',
          sic: '',
          sicDescription: '',
          addresses: {
            business: {
              street: '',
              city: 'San Francisco',
              state: 'CA',
              zip: '',
            },
          },
          filings: [],
        },
      ]);

      await seedingService.seed(10);

      const firmRepo = getRepo(module, Firm);
      const firms = await firmRepo.find();
      const hqFirm = firms.find((f) => f.name.includes('HQ Test PE Firm'));
      expect(hqFirm).toBeDefined();
      expect(hqFirm!.headquarters).toBe('San Francisco, CA');
    });
  });

  describe('ScrapeJob lifecycle', () => {
    let discoverSpy: jest.SpyInstance;

    beforeEach(() => {
      discoverSpy = jest
        .spyOn(publicRankingsSource, 'discoverFirms')
        .mockResolvedValue([]);
    });

    afterEach(() => {
      discoverSpy.mockRestore();
    });

    it('should create a ScrapeJob with RUNNING status initially and transition to COMPLETED', async () => {
      await seedingService.seed(5);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { job_type: JobType.SEED } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe(JobStatus.COMPLETED);
      expect(jobs[0].completed_at).toBeInstanceOf(Date);
      expect(jobs[0].error_message).toBeNull();
    });

    it('should include all metadata fields on the completed ScrapeJob', async () => {
      ctx.mocks.secEdgar.searchInvestmentAdvisers.mockResolvedValue([
        {
          cik: '999',
          name: 'Metadata Test Firm',
          entityType: 'IA',
          sic: '',
          sicDescription: '',
          addresses: {
            business: { street: '', city: 'Miami', state: 'FL', zip: '' },
          },
          filings: [],
        },
      ]);

      await seedingService.seed(10);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { job_type: JobType.SEED } });
      expect(jobs).toHaveLength(1);

      const meta = jobs[0].metadata as any;
      expect(meta).toMatchObject({
        target_firm_count: 10,
        firms_created: expect.any(Number),
        firms_updated: expect.any(Number),
        firms_in_db: expect.any(Number),
        firms_enriched: expect.any(Number),
        rounds: expect.any(Number),
      });
    });

    it('should store the queueJobId when provided', async () => {
      await seedingService.seed(1, 'queue-job-42');

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { job_type: JobType.SEED } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].queue_job_id).toBe('queue-job-42');
    });
  });
});
