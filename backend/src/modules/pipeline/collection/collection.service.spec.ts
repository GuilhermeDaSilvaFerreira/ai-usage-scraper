import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { EntityNotFoundError } from 'typeorm';
import { CollectionService, EXTRACTION_QUEUE } from './collection.service';
import { Firm } from '../../../database/entities/firm.entity';
import { FirmAlias } from '../../../database/entities/firm-alias.entity';
import { DataSource as DataSourceEntity } from '../../../database/entities/data-source.entity';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity';
import {
  JobType,
  JobStatus,
  DataSourceTarget,
  SourceType,
} from '../../../common/enums/index';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service';
import { NewsCollector, CollectedContent } from './collectors/news.collector';
import { HiringCollector } from './collectors/hiring.collector';
import { ConferenceCollector } from './collectors/conference.collector';
import { WebsiteCollector } from './collectors/website.collector';
import { LinkedInCollector } from './collectors/linkedin.collector';

function makeContent(
  overrides: Partial<CollectedContent> = {},
): CollectedContent {
  return {
    url: 'https://example.com/article',
    title: 'Test Article',
    content: `unique-content-${Math.random()}`,
    sourceType: SourceType.NEWS,
    publishedDate: '2025-01-01',
    metadata: {},
    ...overrides,
  };
}

const FIRM_ID = 'firm-uuid-1';
const FIRM: Partial<Firm> = {
  id: FIRM_ID,
  name: 'TestFirm',
  website: 'https://testfirm.com',
};

const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
};

const mockFirmRepo = {
  findOneByOrFail: jest.fn(),
  update: jest.fn(),
};

const mockAliasRepo = {
  find: jest.fn(),
};

const mockDataSourceRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  create: jest.fn((dto: any) => ({ id: `ds-${Math.random()}`, ...dto })),
  save: jest.fn((entities: any) =>
    Array.isArray(entities)
      ? entities.map((e: any, i: number) => ({ ...e, id: `ds-${i}` }))
      : { ...entities, id: 'ds-single' },
  ),
};

const mockJobRepo = {
  create: jest.fn((dto: any) => ({ id: 'job-1', ...dto })),
  save: jest.fn((entity: any) => ({ ...entity })),
};

const mockExtractionQueue = {
  addBulk: jest.fn(),
};

const mockOrchestrator = {
  trackExtractionBatch: jest.fn(),
  onCollectionCompleteNoExtractions: jest.fn(),
};

const mockNewsCollector = { collect: jest.fn() };
const mockHiringCollector = { collect: jest.fn() };
const mockConferenceCollector = { collect: jest.fn() };
const mockWebsiteCollector = { collectForSignals: jest.fn() };
const mockLinkedInCollector = { collectSignals: jest.fn() };

describe('CollectionService', () => {
  let service: CollectionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CollectionService,
        { provide: getRepositoryToken(Firm), useValue: mockFirmRepo },
        { provide: getRepositoryToken(FirmAlias), useValue: mockAliasRepo },
        {
          provide: getRepositoryToken(DataSourceEntity),
          useValue: mockDataSourceRepo,
        },
        { provide: getRepositoryToken(ScrapeJob), useValue: mockJobRepo },
        {
          provide: getQueueToken(EXTRACTION_QUEUE),
          useValue: mockExtractionQueue,
        },
        { provide: PipelineOrchestratorService, useValue: mockOrchestrator },
        { provide: NewsCollector, useValue: mockNewsCollector },
        { provide: HiringCollector, useValue: mockHiringCollector },
        { provide: ConferenceCollector, useValue: mockConferenceCollector },
        { provide: WebsiteCollector, useValue: mockWebsiteCollector },
        { provide: LinkedInCollector, useValue: mockLinkedInCollector },
      ],
    }).compile();

    service = module.get(CollectionService);
    jest.clearAllMocks();

    mockFirmRepo.findOneByOrFail.mockResolvedValue(FIRM);
    mockAliasRepo.find.mockResolvedValue([]);
    mockDataSourceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockFirmRepo.update.mockResolvedValue(undefined);
  });

  describe('collectForFirm', () => {
    beforeEach(() => {
      mockNewsCollector.collect.mockResolvedValue([]);
      mockHiringCollector.collect.mockResolvedValue([]);
      mockConferenceCollector.collect.mockResolvedValue([]);
      mockWebsiteCollector.collectForSignals.mockResolvedValue([]);
      mockLinkedInCollector.collectSignals.mockResolvedValue([]);
    });

    it('creates a RUNNING job and saves it', async () => {
      await service.collectForFirm(FIRM_ID);

      expect(mockJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firm_id: FIRM_ID,
          job_type: JobType.COLLECT_SIGNALS,
          status: JobStatus.RUNNING,
          queue_job_id: null,
        }),
      );
      expect(mockJobRepo.save).toHaveBeenCalled();
    });

    it('passes queueJobId when provided', async () => {
      await service.collectForFirm(FIRM_ID, 'queue-123');

      expect(mockJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ queue_job_id: 'queue-123' }),
      );
    });

    it('collects from all 5 collectors via Promise.allSettled', async () => {
      await service.collectForFirm(FIRM_ID);

      expect(mockNewsCollector.collect).toHaveBeenCalledWith(['TestFirm']);
      expect(mockHiringCollector.collect).toHaveBeenCalledWith(
        ['TestFirm'],
        'https://testfirm.com',
      );
      expect(mockConferenceCollector.collect).toHaveBeenCalledWith([
        'TestFirm',
      ]);
      expect(mockWebsiteCollector.collectForSignals).toHaveBeenCalledWith(
        'TestFirm',
        'https://testfirm.com',
      );
      expect(mockLinkedInCollector.collectSignals).toHaveBeenCalledWith([
        'TestFirm',
      ]);
    });

    it('saves new data sources and returns count', async () => {
      const content = [makeContent(), makeContent()];
      mockNewsCollector.collect.mockResolvedValue(content);

      const result = await service.collectForFirm(FIRM_ID);

      expect(mockDataSourceRepo.create).toHaveBeenCalledTimes(2);
      expect(mockDataSourceRepo.save).toHaveBeenCalled();
      expect(result).toBe(2);
    });

    it('sets DataSourceTarget.FIRM_SIGNALS on created sources', async () => {
      mockNewsCollector.collect.mockResolvedValue([makeContent()]);

      await service.collectForFirm(FIRM_ID);

      expect(mockDataSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          target_entity: DataSourceTarget.FIRM_SIGNALS,
        }),
      );
    });

    it('enqueues extraction jobs for new sources', async () => {
      mockNewsCollector.collect.mockResolvedValue([makeContent()]);

      await service.collectForFirm(FIRM_ID);

      expect(mockExtractionQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'extract',
            data: expect.objectContaining({ firmId: FIRM_ID }),
          }),
        ]),
      );
    });

    it('calls orchestrator.trackExtractionBatch when new sources exist', async () => {
      mockNewsCollector.collect.mockResolvedValue([makeContent()]);

      await service.collectForFirm(FIRM_ID);

      expect(mockOrchestrator.trackExtractionBatch).toHaveBeenCalledWith(
        FIRM_ID,
        1,
      );
    });

    it('updates job to COMPLETED with metadata', async () => {
      const content = [makeContent(), makeContent()];
      mockNewsCollector.collect.mockResolvedValue(content);

      await service.collectForFirm(FIRM_ID);

      const savedJob = mockJobRepo.save.mock.calls.at(-1)[0];
      expect(savedJob.status).toBe(JobStatus.COMPLETED);
      expect(savedJob.completed_at).toBeInstanceOf(Date);
      expect(savedJob.metadata).toEqual({
        total_collected: 2,
        new_sources: 2,
        duplicates_skipped: 0,
      });
    });

    it('updates firm.last_collected_at after success', async () => {
      await service.collectForFirm(FIRM_ID);

      expect(mockFirmRepo.update).toHaveBeenCalledWith(
        FIRM_ID,
        expect.objectContaining({ last_collected_at: expect.any(Date) }),
      );
    });

    it('builds searchNames from firm name only when no aliases', async () => {
      mockAliasRepo.find.mockResolvedValue([]);

      await service.collectForFirm(FIRM_ID);

      expect(mockNewsCollector.collect).toHaveBeenCalledWith(['TestFirm']);
    });

    it('includes alias names in searchNames', async () => {
      mockAliasRepo.find.mockResolvedValue([
        { alias_name: 'TestFirm' },
        { alias_name: 'TF Capital' },
        { alias_name: 'TF Partners' },
      ]);

      await service.collectForFirm(FIRM_ID);

      expect(mockNewsCollector.collect).toHaveBeenCalledWith([
        'TestFirm',
        'TF Capital',
        'TF Partners',
      ]);
    });

    it('filters out alias that matches firm name', async () => {
      mockAliasRepo.find.mockResolvedValue([
        { alias_name: 'TestFirm' },
        { alias_name: 'Alias1' },
      ]);

      await service.collectForFirm(FIRM_ID);

      expect(mockNewsCollector.collect).toHaveBeenCalledWith([
        'TestFirm',
        'Alias1',
      ]);
    });

    it('skips duplicate content (all content already in DB)', async () => {
      const content = makeContent({ content: 'duplicate-body' });
      mockNewsCollector.collect.mockResolvedValue([content]);
      mockQueryBuilder.getMany.mockResolvedValue([
        { raw_content_hash: expect.any(String) },
      ]);

      const { computeContentHash } = jest.requireActual(
        '../../../common/utils/text.utils',
      );
      const hash = computeContentHash('duplicate-body');
      mockQueryBuilder.getMany.mockResolvedValue([{ raw_content_hash: hash }]);

      await service.collectForFirm(FIRM_ID);

      expect(mockDataSourceRepo.save).not.toHaveBeenCalled();
      expect(
        mockOrchestrator.onCollectionCompleteNoExtractions,
      ).toHaveBeenCalledWith(FIRM_ID);
    });

    it('calls onCollectionCompleteNoExtractions when no new sources', async () => {
      await service.collectForFirm(FIRM_ID);

      expect(
        mockOrchestrator.onCollectionCompleteNoExtractions,
      ).toHaveBeenCalledWith(FIRM_ID);
      expect(mockExtractionQueue.addBulk).not.toHaveBeenCalled();
    });

    it('records duplicates_skipped in job metadata', async () => {
      const c1 = makeContent({ content: 'dup' });
      const c2 = makeContent({ content: 'new-content' });
      mockNewsCollector.collect.mockResolvedValue([c1, c2]);

      const { computeContentHash } = jest.requireActual(
        '../../../common/utils/text.utils',
      );
      mockQueryBuilder.getMany.mockResolvedValue([
        { raw_content_hash: computeContentHash('dup') },
      ]);

      await service.collectForFirm(FIRM_ID);

      const savedJob = mockJobRepo.save.mock.calls.at(-1)[0];
      expect(savedJob.metadata.total_collected).toBe(2);
      expect(savedJob.metadata.new_sources).toBe(1);
      expect(savedJob.metadata.duplicates_skipped).toBe(1);
    });

    it('handles some collectors failing via allSettled', async () => {
      mockNewsCollector.collect.mockResolvedValue([makeContent()]);
      mockHiringCollector.collect.mockRejectedValue(
        new Error('hiring timeout'),
      );
      mockConferenceCollector.collect.mockRejectedValue(
        new Error('conference error'),
      );
      mockWebsiteCollector.collectForSignals.mockResolvedValue([makeContent()]);
      mockLinkedInCollector.collectSignals.mockRejectedValue(
        new Error('linkedin error'),
      );

      const result = await service.collectForFirm(FIRM_ID);

      expect(result).toBe(2);
    });

    it('collects zero when all collectors fail', async () => {
      mockNewsCollector.collect.mockRejectedValue(new Error('fail'));
      mockHiringCollector.collect.mockRejectedValue(new Error('fail'));
      mockConferenceCollector.collect.mockRejectedValue(new Error('fail'));
      mockWebsiteCollector.collectForSignals.mockRejectedValue(
        new Error('fail'),
      );
      mockLinkedInCollector.collectSignals.mockRejectedValue(new Error('fail'));

      const result = await service.collectForFirm(FIRM_ID);

      expect(result).toBe(0);
      expect(
        mockOrchestrator.onCollectionCompleteNoExtractions,
      ).toHaveBeenCalledWith(FIRM_ID);
    });

    it('throws and marks job FAILED on DB error in findOneByOrFail', async () => {
      mockFirmRepo.findOneByOrFail.mockRejectedValue(
        new EntityNotFoundError(Firm, { id: FIRM_ID }),
      );

      await expect(service.collectForFirm(FIRM_ID)).rejects.toThrow();
    });

    it('marks job FAILED and re-throws on error during collection', async () => {
      const error = new Error('save blew up');
      mockNewsCollector.collect.mockResolvedValue([makeContent()]);
      mockDataSourceRepo.save.mockRejectedValueOnce(error);

      await expect(service.collectForFirm(FIRM_ID)).rejects.toThrow(
        'save blew up',
      );

      const failedJob = mockJobRepo.save.mock.calls.at(-1)[0];
      expect(failedJob.status).toBe(JobStatus.FAILED);
      expect(failedJob.error_message).toContain('save blew up');
      expect(failedJob.completed_at).toBeInstanceOf(Date);
    });

    it('stores error message as string in job', async () => {
      mockNewsCollector.collect.mockResolvedValue([makeContent()]);
      mockDataSourceRepo.save.mockRejectedValueOnce(42);

      await expect(service.collectForFirm(FIRM_ID)).rejects.toBe(42);

      const failedJob = mockJobRepo.save.mock.calls.at(-1)[0];
      expect(failedJob.error_message).toBe('42');
    });

    it('merges content from all fulfilled collectors', async () => {
      mockNewsCollector.collect.mockResolvedValue([
        makeContent({ url: 'https://news.com/1' }),
      ]);
      mockHiringCollector.collect.mockResolvedValue([
        makeContent({ url: 'https://hiring.com/1' }),
      ]);
      mockConferenceCollector.collect.mockResolvedValue([
        makeContent({ url: 'https://conf.com/1' }),
      ]);
      mockWebsiteCollector.collectForSignals.mockResolvedValue([
        makeContent({ url: 'https://website.com/1' }),
      ]);
      mockLinkedInCollector.collectSignals.mockResolvedValue([
        makeContent({ url: 'https://linkedin.com/1' }),
      ]);

      const result = await service.collectForFirm(FIRM_ID);

      expect(result).toBe(5);
      expect(mockDataSourceRepo.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('assessReliability (through collectForFirm)', () => {
    beforeEach(() => {
      mockNewsCollector.collect.mockResolvedValue([]);
      mockHiringCollector.collect.mockResolvedValue([]);
      mockConferenceCollector.collect.mockResolvedValue([]);
      mockWebsiteCollector.collectForSignals.mockResolvedValue([]);
      mockLinkedInCollector.collectSignals.mockResolvedValue([]);
    });

    const testReliability = async (url: string, expectedScore: number) => {
      mockNewsCollector.collect.mockResolvedValue([makeContent({ url })]);
      await service.collectForFirm(FIRM_ID);
      expect(mockDataSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reliability_score: expectedScore }),
      );
    };

    it('scores sec.gov URLs as 0.95', async () => {
      await testReliability('https://www.sec.gov/filing/12345', 0.95);
    });

    it('scores .gov URLs as 0.95', async () => {
      await testReliability('https://data.gov/dataset/ai', 0.95);
    });

    it('scores linkedin.com URLs as 0.7', async () => {
      await testReliability('https://linkedin.com/in/person', 0.7);
    });

    it('scores bloomberg.com URLs as 0.9', async () => {
      await testReliability('https://bloomberg.com/news/article', 0.9);
    });

    it('scores reuters.com URLs as 0.9', async () => {
      await testReliability('https://reuters.com/business/article', 0.9);
    });

    it('scores wsj.com URLs as 0.9', async () => {
      await testReliability('https://wsj.com/articles/test', 0.9);
    });

    it('scores ft.com URLs as 0.9', async () => {
      await testReliability('https://ft.com/content/abc', 0.9);
    });

    it('scores techcrunch.com URLs as 0.75', async () => {
      await testReliability('https://techcrunch.com/2025/01/01/startup', 0.75);
    });

    it('scores businessinsider.com URLs as 0.75', async () => {
      await testReliability('https://businessinsider.com/article', 0.75);
    });

    it('scores unknown URLs as 0.5', async () => {
      await testReliability('https://randomblog.xyz/post', 0.5);
    });

    it('is case-insensitive', async () => {
      await testReliability('https://WWW.SEC.GOV/Filing', 0.95);
    });
  });
});
