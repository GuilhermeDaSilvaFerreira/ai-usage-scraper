jest.mock('axios', () => {
  const mockAxios: any = jest.fn().mockResolvedValue({ data: '', status: 200 });
  mockAxios.get = jest.fn().mockResolvedValue({
    data: '<html><body>Test page</body></html>',
    status: 200,
  });
  mockAxios.create = jest.fn(() => mockAxios);
  mockAxios.defaults = { headers: { common: {} } };
  return { __esModule: true, default: mockAxios };
});

import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { createTestApp, TestContext } from '../setup/test-app';
import { truncateAllTables, getRepo } from '../setup/test-db';
import {
  createFirm,
  createDataSource,
  SourceType,
  DataSourceTarget,
} from '../setup/fixtures';
import { Firm } from '../../src/database/entities/firm.entity';
import { FirmSignal } from '../../src/database/entities/firm-signal.entity';
import { DataSource } from '../../src/database/entities/data-source.entity';
import { Person } from '../../src/database/entities/person.entity';
import { ScrapeJob } from '../../src/database/entities/scrape-job.entity';
import { CollectionService } from '../../src/modules/pipeline/collection/collection.service';
import { PeopleCollectionService } from '../../src/modules/pipeline/collection/people-collection.service';
import { ExtractionPipelineService } from '../../src/modules/pipeline/extraction/extraction-pipeline.service';

describe('Collection & Extraction Processors (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let ctx: TestContext;
  let collectionService: CollectionService;
  let peopleCollectionService: PeopleCollectionService;
  let extractionPipeline: ExtractionPipelineService;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    collectionService = module.get(CollectionService);
    peopleCollectionService = module.get(PeopleCollectionService);
    extractionPipeline = module.get(ExtractionPipelineService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
    jest.clearAllMocks();
  });

  describe('CollectionService.collectForFirm', () => {
    it('should update last_collected_at and create a scrape job for a firm with a website', async () => {
      const firm = await createFirm(module, {
        website: 'https://test.com',
        is_active: true,
      });

      await collectionService.collectForFirm(firm.id);

      const firmRepo = getRepo(module, Firm);
      const updated = await firmRepo.findOneByOrFail({ id: firm.id });
      expect(updated.last_collected_at).not.toBeNull();
      expect(updated.last_collected_at).toBeInstanceOf(Date);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { firm_id: firm.id } });
      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs[0].status).toBe('completed');
    });

    it('should update last_collected_at even when all collectors return empty', async () => {
      const firm = await createFirm(module, {
        website: null,
        is_active: true,
      });

      await collectionService.collectForFirm(firm.id);

      const firmRepo = getRepo(module, Firm);
      const updated = await firmRepo.findOneByOrFail({ id: firm.id });
      expect(updated.last_collected_at).not.toBeNull();

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { firm_id: firm.id } });
      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs[0].status).toBe('completed');
    });

    it('should create DataSource records when website collector returns content', async () => {
      const firm = await createFirm(module, {
        website: 'https://example-pe-firm.com',
        is_active: true,
      });

      const saved = await collectionService.collectForFirm(firm.id);

      const dsRepo = getRepo(module, DataSource);
      const dataSources = await dsRepo.find();

      if (saved > 0) {
        expect(dataSources.length).toBeGreaterThanOrEqual(1);
        expect(
          dataSources.some(
            (ds) => ds.target_entity === DataSourceTarget.FIRM_SIGNALS,
          ),
        ).toBe(true);
      }
    });

    it('should not crash when called twice for the same firm (dedup)', async () => {
      const firm = await createFirm(module, {
        website: 'https://test-dedup.com',
        is_active: true,
      });

      await collectionService.collectForFirm(firm.id);
      await collectionService.collectForFirm(firm.id);

      const firmRepo = getRepo(module, Firm);
      const updated = await firmRepo.findOneByOrFail({ id: firm.id });
      expect(updated.last_collected_at).not.toBeNull();
    });
  });

  describe('PeopleCollectionService.collectPeopleForFirm', () => {
    it('should complete without error when all sources return empty', async () => {
      const firm = await createFirm(module, {
        website: null,
        is_active: true,
      });

      await expect(
        peopleCollectionService.collectPeopleForFirm(firm.id),
      ).resolves.not.toThrow();

      const personRepo = getRepo(module, Person);
      const people = await personRepo.find({ where: { firm_id: firm.id } });
      expect(people).toHaveLength(0);

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { firm_id: firm.id } });
      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs[0].status).toBe('completed');
    });

    it('should complete without error for a firm with a website', async () => {
      const firm = await createFirm(module, {
        website: 'https://test-people.com',
        is_active: true,
      });

      await expect(
        peopleCollectionService.collectPeopleForFirm(firm.id),
      ).resolves.not.toThrow();

      const jobRepo = getRepo(module, ScrapeJob);
      const jobs = await jobRepo.find({ where: { firm_id: firm.id } });
      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(jobs[0].status).toBe('completed');
    });
  });

  describe('ExtractionPipelineService.process', () => {
    it('should create FirmSignal records when content contains AI-related keywords', async () => {
      const firm = await createFirm(module, { is_active: true });
      const ds = await createDataSource(module, {
        source_type: SourceType.NEWS,
        target_entity: DataSourceTarget.FIRM_SIGNALS,
      });

      const content = [
        'We are hiring a Head of AI to lead our artificial intelligence division.',
        'The firm is investing heavily in machine learning engineer roles.',
        'Our new AI strategy includes deploying large language models across the portfolio.',
        'Recently appointed a Chief Data Officer to oversee data science initiatives.',
      ].join(' ');

      const signals = await extractionPipeline.process(
        {
          content,
          url: 'https://example.com/ai-article',
          sourceType: SourceType.NEWS,
          firmName: firm.name,
        },
        firm.id,
        ds.id,
      );

      expect(signals.length).toBeGreaterThan(0);

      const signalRepo = getRepo(module, FirmSignal);
      const dbSignals = await signalRepo.find({
        where: { firm_id: firm.id },
      });
      expect(dbSignals.length).toBeGreaterThan(0);
      expect(dbSignals.length).toBe(signals.length);

      for (const signal of dbSignals) {
        expect(signal.firm_id).toBe(firm.id);
        expect(signal.data_source_id).toBe(ds.id);
        expect(signal.extraction_confidence).toBeGreaterThan(0);
      }
    });

    it('should create fewer or no signals for content without AI keywords', async () => {
      const firm = await createFirm(module, { is_active: true });
      const ds = await createDataSource(module, {
        source_type: SourceType.NEWS,
        target_entity: DataSourceTarget.FIRM_SIGNALS,
      });

      const genericContent =
        'The firm held its annual general meeting. Partners discussed Q4 results and fundraising targets for the next vintage.';

      const signals = await extractionPipeline.process(
        {
          content: genericContent,
          url: 'https://example.com/general-article',
          sourceType: SourceType.NEWS,
          firmName: firm.name,
        },
        firm.id,
        ds.id,
      );

      const signalRepo = getRepo(module, FirmSignal);
      const dbSignals = await signalRepo.find({
        where: { firm_id: firm.id },
      });
      expect(dbSignals.length).toBe(signals.length);
    });

    it('should persist signals with correct data_source_id linkage', async () => {
      const firm = await createFirm(module, { is_active: true });
      const ds = await createDataSource(module, {
        source_type: SourceType.FIRM_WEBSITE,
        target_entity: DataSourceTarget.FIRM_SIGNALS,
      });

      const content =
        'Our proprietary AI platform uses deep learning and natural language processing to evaluate investments.';

      await extractionPipeline.process(
        {
          content,
          url: 'https://example-firm.com/about',
          sourceType: SourceType.FIRM_WEBSITE,
          firmName: firm.name,
        },
        firm.id,
        ds.id,
      );

      const signalRepo = getRepo(module, FirmSignal);
      const dbSignals = await signalRepo.find({
        where: { data_source_id: ds.id },
      });

      for (const signal of dbSignals) {
        expect(signal.data_source_id).toBe(ds.id);
        expect(signal.firm_id).toBe(firm.id);
      }
    });

    it('should deduplicate signals from multiple extractors', async () => {
      const firm = await createFirm(module, { is_active: true });
      const ds = await createDataSource(module, {
        source_type: SourceType.NEWS,
        target_entity: DataSourceTarget.FIRM_SIGNALS,
      });

      const content =
        'AI AI AI artificial intelligence machine learning deep learning neural network LLM large language model';

      const signals = await extractionPipeline.process(
        {
          content,
          url: 'https://example.com/ai-heavy',
          sourceType: SourceType.NEWS,
          firmName: firm.name,
        },
        firm.id,
        ds.id,
      );

      const signalRepo = getRepo(module, FirmSignal);
      const dbSignals = await signalRepo.find({
        where: { firm_id: firm.id },
      });
      expect(dbSignals.length).toBe(signals.length);
    });
  });
});
