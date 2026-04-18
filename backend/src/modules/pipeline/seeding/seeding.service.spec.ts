import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SeedingService } from './seeding.service';
import { EntityResolutionService } from './entity-resolution.service';
import { FirmEnrichmentService } from './firm-enrichment.service';
import { SecEdgarSource } from './sources/sec-edgar.source';
import { ExaSearchSource } from './sources/exa-search.source';
import { PublicRankingsSource } from './sources/public-rankings.source';
import { Firm } from '../../../database/entities/firm.entity';
import { FirmAlias } from '../../../database/entities/firm-alias.entity';
import { DataSource as DataSourceEntity } from '../../../database/entities/data-source.entity';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity';
import { JobStatus } from '../../../common/enums/job-type.enum';
import { SourceType } from '../../../common/enums/source-type.enum';
import { FirmType } from '../../../common/enums';

jest.mock('../../../common/utils/index', () => ({
  createSlug: jest.requireActual('../../../common/utils/index').createSlug,
  cleanFirmName: jest.requireActual('../../../common/utils/index')
    .cleanFirmName,
  CommonLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('SeedingService', () => {
  let service: SeedingService;

  const savedJob = { id: 'job-1' } as any;
  const mockFirmRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockAliasRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockDataSourceRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockJobRepo = {
    create: jest.fn().mockReturnValue(savedJob),
    save: jest.fn().mockResolvedValue(savedJob),
  };

  const mockSecEdgar = { discoverFirms: jest.fn().mockResolvedValue([]) };
  const mockExa = { discoverFirms: jest.fn().mockResolvedValue([]) };
  const mockPublic = { discoverFirms: jest.fn().mockResolvedValue([]) };
  const mockEntityResolution = { deduplicate: jest.fn().mockReturnValue([]) };
  const mockEnrichment = {
    enrichFirmsWithGaps: jest
      .fn()
      .mockResolvedValue({ enriched: 0, skipped: 0, failed: 0 }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SeedingService,
        { provide: getRepositoryToken(Firm), useValue: mockFirmRepo },
        { provide: getRepositoryToken(FirmAlias), useValue: mockAliasRepo },
        {
          provide: getRepositoryToken(DataSourceEntity),
          useValue: mockDataSourceRepo,
        },
        { provide: getRepositoryToken(ScrapeJob), useValue: mockJobRepo },
        { provide: SecEdgarSource, useValue: mockSecEdgar },
        { provide: ExaSearchSource, useValue: mockExa },
        { provide: PublicRankingsSource, useValue: mockPublic },
        {
          provide: EntityResolutionService,
          useValue: mockEntityResolution,
        },
        { provide: FirmEnrichmentService, useValue: mockEnrichment },
      ],
    }).compile();

    service = module.get(SeedingService);
    jest.clearAllMocks();

    mockJobRepo.create.mockReturnValue(savedJob);
    mockJobRepo.save.mockResolvedValue(savedJob);
    mockFirmRepo.count.mockResolvedValue(0);
    mockFirmRepo.findOne.mockResolvedValue(null);
    mockFirmRepo.create.mockImplementation((data: any) => ({
      id: 'firm-new',
      ...data,
    }));
    mockFirmRepo.save.mockImplementation(async (entity: any) => entity);
    mockAliasRepo.findOne.mockResolvedValue(null);
    mockAliasRepo.create.mockImplementation((data: any) => data);
    mockAliasRepo.save.mockImplementation(async (entity: any) => entity);
    mockDataSourceRepo.create.mockImplementation((data: any) => ({
      id: 'ds-1',
      ...data,
    }));
    mockDataSourceRepo.save.mockImplementation(async (entity: any) => entity);
    mockEnrichment.enrichFirmsWithGaps.mockResolvedValue({
      enriched: 0,
      skipped: 0,
      failed: 0,
    });
  });

  function makeMerged(
    name: string,
    source: string,
    opts: Partial<{
      aliases: string[];
      sources: string[];
      website: string;
      aumUsd: number;
      firmType: FirmType;
      headquarters: string;
      secCrdNumber: string;
    }> = {},
  ) {
    return {
      name,
      source,
      aliases: opts.aliases ?? [name],
      sources: opts.sources ?? [source],
      website: opts.website,
      aumUsd: opts.aumUsd,
      firmType: opts.firmType,
      headquarters: opts.headquarters,
      secCrdNumber: opts.secCrdNumber,
    };
  }

  describe('seed — already at target', () => {
    it('should run enrichment only and return zeros', async () => {
      mockFirmRepo.count.mockResolvedValue(100);
      mockEnrichment.enrichFirmsWithGaps.mockResolvedValue({
        enriched: 5,
        skipped: 0,
        failed: 0,
      });

      const result = await service.seed(100);

      expect(result.firmsCreated).toBe(0);
      expect(result.firmsUpdated).toBe(0);
      expect(result.firmsEnriched).toBe(5);
      expect(result.rounds).toBe(0);
      expect(mockEnrichment.enrichFirmsWithGaps).toHaveBeenCalledTimes(1);
      expect(mockSecEdgar.discoverFirms).not.toHaveBeenCalled();
    });
  });

  describe('seed — single round fills target', () => {
    it('should discover, deduplicate, persist, then enrich', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const candidates = [
        makeMerged('Alpha Capital', 'sec_edgar'),
        makeMerged('Beta Partners', 'exa:url1'),
      ];
      mockSecEdgar.discoverFirms.mockResolvedValue([
        { name: 'Alpha Capital', source: 'sec_edgar' },
      ]);
      mockExa.discoverFirms.mockResolvedValue([
        { name: 'Beta Partners', source: 'exa:url1' },
      ]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(candidates);

      const result = await service.seed(10);

      expect(result.rounds).toBe(1);
      expect(result.firmsCreated).toBe(2);
      expect(mockEnrichment.enrichFirmsWithGaps).toHaveBeenCalledTimes(1);
      expect(savedJob.status).toBe(JobStatus.COMPLETED);
    });
  });

  describe('seed — multiple rounds needed', () => {
    it('should loop until target is reached', async () => {
      mockFirmRepo.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3)
        .mockResolvedValue(10);

      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);

      const round1 = [makeMerged('R1 Capital', 'sec_edgar')];
      const round2 = [makeMerged('R2 Partners', 'exa:url')];
      mockEntityResolution.deduplicate
        .mockReturnValueOnce(round1)
        .mockReturnValueOnce(round2);

      const result = await service.seed(10);

      expect(result.rounds).toBe(2);
    });
  });

  describe('seed — consecutive empty rounds', () => {
    it('should stop after 2 consecutive empty rounds', async () => {
      mockFirmRepo.count.mockResolvedValue(0);
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue([]);

      const result = await service.seed(100);

      expect(result.rounds).toBe(2);
    });
  });

  describe('seed — MAX_ROUNDS reached', () => {
    it('should stop at MAX_ROUNDS=5', async () => {
      mockFirmRepo.count.mockResolvedValue(0);

      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);

      let round = 0;
      mockEntityResolution.deduplicate.mockImplementation(() => {
        round++;
        return [makeMerged(`Firm${round} Capital`, `sec_edgar`)];
      });

      const result = await service.seed(10000);

      expect(result.rounds).toBe(5);
    });
  });

  describe('seed — error path', () => {
    it('should mark job FAILED and re-throw on error', async () => {
      mockFirmRepo.count.mockRejectedValue(new Error('DB connection error'));

      await expect(service.seed(100)).rejects.toThrow('DB connection error');

      expect(savedJob.status).toBe(JobStatus.FAILED);
      expect(savedJob.error_message).toContain('DB connection error');
    });
  });

  describe('seed — public rankings only called in first 2 rounds', () => {
    it('should call publicRankingsSource.discoverFirms only in rounds 1 and 2', async () => {
      mockFirmRepo.count.mockResolvedValue(0);
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);

      let round = 0;
      mockEntityResolution.deduplicate.mockImplementation(() => {
        round++;
        return [makeMerged(`Firm${round} Capital`, 'sec_edgar')];
      });

      await service.seed(10000);

      expect(mockPublic.discoverFirms).toHaveBeenCalledTimes(2);
    });
  });

  describe('persistFirms — new firm creation', () => {
    it('should create a new firm when slug does not exist', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const merged = [
        makeMerged('NewFirm Capital', 'sec_edgar', {
          website: 'https://newfirm.com',
          aumUsd: 50_000_000_000,
          firmType: FirmType.BUYOUT,
          headquarters: 'New York',
          secCrdNumber: '12345',
        }),
      ];
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(merged);

      const result = await service.seed(10);

      expect(result.firmsCreated).toBe(1);
      expect(mockFirmRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'NewFirm Capital',
          slug: 'newfirm-capital',
          website: 'https://newfirm.com',
          firm_type: FirmType.BUYOUT,
        }),
      );
    });
  });

  describe('persistFirms — existing firm update', () => {
    it('should update existing firm with missing fields', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const existingFirm = {
        id: 'firm-existing',
        slug: 'existing-capital',
        name: 'Existing Capital',
        website: null,
        aum_usd: null,
        firm_type: null,
        headquarters: null,
        sec_crd_number: null,
        data_source_id: null,
      };
      mockFirmRepo.findOne.mockResolvedValue(existingFirm);

      const merged = [
        makeMerged('Existing Capital', 'sec_edgar', {
          website: 'https://existing.com',
          aumUsd: 100_000_000_000,
          firmType: FirmType.CREDIT,
          headquarters: 'Chicago',
          secCrdNumber: '99999',
        }),
      ];
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(merged);

      const result = await service.seed(10);

      expect(result.firmsUpdated).toBe(1);
      expect(result.firmsCreated).toBe(0);
      expect(existingFirm.website).toBe('https://existing.com');
      expect(existingFirm.firm_type).toBe(FirmType.CREDIT);
    });
  });

  describe('persistFirms — invalid name skipped', () => {
    it('should skip candidates with names that clean to null', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const merged = [
        makeMerged('A', 'sec_edgar'),
        makeMerged('Valid Partners Capital', 'sec_edgar'),
      ];
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(merged);

      const result = await service.seed(10);

      expect(result.firmsCreated).toBe(1);
    });
  });

  describe('persistFirms — saves aliases', () => {
    it('should save aliases for new firms', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const merged = [
        makeMerged('Alias Firm Capital', 'sec_edgar', {
          aliases: ['Alias Firm Capital', 'Alias Firm Cap'],
        }),
      ];
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(merged);

      await service.seed(10);

      expect(mockAliasRepo.save).toHaveBeenCalled();
    });
  });

  describe('persistFirms — saves data sources', () => {
    it('should create data source records for each source', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const merged = [
        makeMerged('DS Firm Capital', 'sec_edgar', {
          sources: ['sec_edgar', 'exa:url'],
        }),
      ];
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(merged);

      await service.seed(10);

      expect(mockDataSourceRepo.save).toHaveBeenCalled();
      const createCalls = mockDataSourceRepo.create.mock.calls;
      const sourceTypes = createCalls.map((c: any[]) => c[0].source_type);
      expect(sourceTypes).toContain(SourceType.SEC_EDGAR);
      expect(sourceTypes).toContain(SourceType.EXA_SEARCH);
    });
  });

  describe('mapSourceType', () => {
    it('should map sec_edgar prefix to SEC_EDGAR', () => {
      const result = (service as any).mapSourceType('sec_edgar:adviser');
      expect(result).toBe(SourceType.SEC_EDGAR);
    });

    it('should map exa prefix to EXA_SEARCH', () => {
      const result = (service as any).mapSourceType('exa:http://url');
      expect(result).toBe(SourceType.EXA_SEARCH);
    });

    it('should map public_ranking prefix to PUBLIC_RANKING', () => {
      const result = (service as any).mapSourceType('public_ranking:wikipedia');
      expect(result).toBe(SourceType.PUBLIC_RANKING);
    });

    it('should default to EXA_SEARCH for unknown sources', () => {
      const result = (service as any).mapSourceType('unknown_source');
      expect(result).toBe(SourceType.EXA_SEARCH);
    });
  });

  describe('persistFirms — existing firm not changed when all fields present', () => {
    it('should not increment updated count if nothing changed', async () => {
      mockFirmRepo.count.mockResolvedValueOnce(0).mockResolvedValue(10);

      const existingFirm = {
        id: 'firm-full',
        slug: 'full-firm-capital',
        name: 'Full Firm Capital',
        website: 'https://full.com',
        aum_usd: 999_000_000_000,
        firm_type: FirmType.BUYOUT,
        headquarters: 'NYC',
        sec_crd_number: '11111',
        data_source_id: 'ds-existing',
      };
      mockFirmRepo.findOne.mockResolvedValue(existingFirm);

      const merged = [makeMerged('Full Firm Capital', 'sec_edgar')];
      mockSecEdgar.discoverFirms.mockResolvedValue([]);
      mockExa.discoverFirms.mockResolvedValue([]);
      mockPublic.discoverFirms.mockResolvedValue([]);
      mockEntityResolution.deduplicate.mockReturnValue(merged);

      const result = await service.seed(10);

      expect(result.firmsUpdated).toBe(0);
    });
  });

  describe('seed — queueJobId is stored', () => {
    it('should pass queue job id to job metadata', async () => {
      mockFirmRepo.count.mockResolvedValue(100);

      await service.seed(100, 'queue-123');

      expect(mockJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ queue_job_id: 'queue-123' }),
      );
    });
  });
});
