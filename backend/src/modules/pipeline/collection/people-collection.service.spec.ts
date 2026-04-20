import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityNotFoundError } from 'typeorm';
import { PeopleCollectionService } from './people-collection.service';
import { Firm } from '../../../database/entities/firm.entity';
import { FirmAlias } from '../../../database/entities/firm-alias.entity';
import { DataSource as DataSourceEntity } from '../../../database/entities/data-source.entity';
import { Person } from '../../../database/entities/person.entity';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity';
import {
  JobType,
  JobStatus,
  DataSourceTarget,
  SourceType,
  RoleCategory,
} from '../../../common/enums/index';
import { CollectedContent } from './collectors/news.collector';
import { LinkedInCollector } from './collectors/linkedin.collector';
import { WebsiteCollector } from './collectors/website.collector';
import { SecAdvCollector } from './collectors/sec-adv.collector';
import { LlmPeopleExtractor } from './llm-people-extractor';

const FIRM_ID = 'firm-uuid-1';
const FIRM: Partial<Firm> = {
  id: FIRM_ID,
  name: 'TestFirm',
  website: 'https://testfirm.com',
};

function makeContent(
  overrides: Partial<CollectedContent> = {},
): CollectedContent {
  return {
    url: 'https://example.com/page',
    title: 'Test Page',
    content: `unique-content-${Math.random()}`,
    sourceType: SourceType.LINKEDIN,
    publishedDate: '2025-01-01',
    metadata: {},
    ...overrides,
  };
}

function makeLinkedInContent(
  name: string,
  title: string,
  overrides: Partial<CollectedContent> = {},
): CollectedContent {
  return makeContent({
    url: 'https://linkedin.com/in/johndoe',
    title: `${name} - ${title} at TestFirm | LinkedIn`,
    content: 'Profile content',
    sourceType: SourceType.LINKEDIN,
    ...overrides,
  });
}

function makeWebsiteTeamContent(
  bodyLines: string[],
  overrides: Partial<CollectedContent> = {},
): CollectedContent {
  return makeContent({
    url: 'https://testfirm.com/team',
    title: 'Our Team',
    content: bodyLines.join('\n'),
    sourceType: SourceType.FIRM_WEBSITE,
    ...overrides,
  });
}

const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
};

const mockFirmRepo = {
  findOneByOrFail: jest.fn(),
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

const mockPersonRepo = {
  findOne: jest.fn(),
  create: jest.fn((dto: any) => ({ id: `person-${Math.random()}`, ...dto })),
  save: jest.fn((entity: any) => ({ ...entity })),
};

const mockJobRepo = {
  create: jest.fn((dto: any) => ({ id: 'job-1', ...dto })),
  save: jest.fn((entity: any) => ({ ...entity })),
};

const mockLinkedInCollector = { collectPeople: jest.fn() };
const mockWebsiteCollector = { collectForPeople: jest.fn() };
const mockSecAdvCollector = { collectForPeople: jest.fn() };
const mockLlmExtractor = {
  isEnabled: jest.fn().mockReturnValue(true),
  extractForFirm: jest.fn().mockResolvedValue(new Map()),
};

describe('PeopleCollectionService', () => {
  let service: PeopleCollectionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PeopleCollectionService,
        { provide: getRepositoryToken(Firm), useValue: mockFirmRepo },
        { provide: getRepositoryToken(FirmAlias), useValue: mockAliasRepo },
        {
          provide: getRepositoryToken(DataSourceEntity),
          useValue: mockDataSourceRepo,
        },
        { provide: getRepositoryToken(Person), useValue: mockPersonRepo },
        { provide: getRepositoryToken(ScrapeJob), useValue: mockJobRepo },
        { provide: LinkedInCollector, useValue: mockLinkedInCollector },
        { provide: WebsiteCollector, useValue: mockWebsiteCollector },
        { provide: SecAdvCollector, useValue: mockSecAdvCollector },
        { provide: LlmPeopleExtractor, useValue: mockLlmExtractor },
      ],
    }).compile();

    service = module.get(PeopleCollectionService);
    jest.clearAllMocks();

    mockFirmRepo.findOneByOrFail.mockResolvedValue(FIRM);
    mockAliasRepo.find.mockResolvedValue([]);
    mockDataSourceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockPersonRepo.findOne.mockResolvedValue(null);
    mockLinkedInCollector.collectPeople.mockResolvedValue([]);
    mockWebsiteCollector.collectForPeople.mockResolvedValue([]);
    mockSecAdvCollector.collectForPeople.mockResolvedValue([]);
    mockLlmExtractor.isEnabled.mockReturnValue(true);
    mockLlmExtractor.extractForFirm.mockResolvedValue(new Map());
  });

  describe('collectPeopleForFirm', () => {
    it('creates a RUNNING job and saves it', async () => {
      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firm_id: FIRM_ID,
          job_type: JobType.COLLECT_PEOPLE,
          status: JobStatus.RUNNING,
          queue_job_id: null,
        }),
      );
      expect(mockJobRepo.save).toHaveBeenCalled();
    });

    it('passes queueJobId when provided', async () => {
      await service.collectPeopleForFirm(FIRM_ID, 'queue-xyz');

      expect(mockJobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ queue_job_id: 'queue-xyz' }),
      );
    });

    it('calls both collectors via Promise.allSettled', async () => {
      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockLinkedInCollector.collectPeople).toHaveBeenCalledWith([
        'TestFirm',
      ]);
      expect(mockWebsiteCollector.collectForPeople).toHaveBeenCalledWith(
        'TestFirm',
        'https://testfirm.com',
      );
    });

    it('saves new data sources with DataSourceTarget.PEOPLE', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockDataSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          target_entity: DataSourceTarget.PEOPLE,
        }),
      );
      expect(mockDataSourceRepo.save).toHaveBeenCalled();
    });

    it('returns number of saved data sources', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
        makeLinkedInContent('Jane Smith', 'Head of AI'),
      ]);

      const result = await service.collectPeopleForFirm(FIRM_ID);

      expect(result).toBe(2);
    });

    it('updates job to COMPLETED with metadata including people_created', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      const savedJob = mockJobRepo.save.mock.calls.at(-1)?.[0];
      expect(savedJob.status).toBe(JobStatus.COMPLETED);
      expect(savedJob.completed_at).toBeInstanceOf(Date);
      expect(savedJob.metadata).toEqual(
        expect.objectContaining({
          total_collected: 1,
          new_sources: 1,
          duplicates_skipped: 0,
          people_created: expect.any(Number),
        }),
      );
    });

    it('uses only firm name when no aliases', async () => {
      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockLinkedInCollector.collectPeople).toHaveBeenCalledWith([
        'TestFirm',
      ]);
    });

    it('includes alias names in searchNames', async () => {
      mockAliasRepo.find.mockResolvedValue([
        { alias_name: 'TestFirm' },
        { alias_name: 'TF Corp' },
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockLinkedInCollector.collectPeople).toHaveBeenCalledWith([
        'TestFirm',
        'TF Corp',
      ]);
    });

    it('skips all duplicate content and returns 0', async () => {
      const content = makeLinkedInContent('John Doe', 'Chief Data Officer', {
        content: 'dup-body',
      });
      mockLinkedInCollector.collectPeople.mockResolvedValue([content]);

      const { computeContentHash } = jest.requireActual(
        '../../../common/utils/text.utils',
      );
      mockQueryBuilder.getMany.mockResolvedValue([
        { raw_content_hash: computeContentHash('dup-body') },
      ]);

      const result = await service.collectPeopleForFirm(FIRM_ID);

      expect(result).toBe(0);
      expect(mockDataSourceRepo.save).not.toHaveBeenCalled();
    });

    it('creates a person from a valid LinkedIn profile with AI-relevant role', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firm_id: FIRM_ID,
          full_name: 'John Doe',
          title: 'Chief Data Officer',
          role_category: RoleCategory.HEAD_OF_DATA,
          linkedin_url: 'https://linkedin.com/in/johndoe',
          confidence: 0.75,
        }),
      );
      expect(mockPersonRepo.save).toHaveBeenCalled();
    });

    it('parses pipe-separated LinkedIn titles', async () => {
      const content = makeContent({
        url: 'https://linkedin.com/in/janedoe',
        title: 'Jane Smith | CTO | LinkedIn',
        content: 'Profile content',
      });
      mockLinkedInCollector.collectPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Jane Smith',
          title: 'CTO',
          role_category: RoleCategory.HEAD_OF_TECH,
        }),
      );
    });

    it('skips LinkedIn profiles with non-AI roles', async () => {
      const content = makeContent({
        url: 'https://linkedin.com/in/sales',
        title: 'Bob Jones - Sales Manager at TestFirm | LinkedIn',
        content: 'Sales profile',
      });
      mockLinkedInCollector.collectPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).not.toHaveBeenCalled();
    });

    it('skips LinkedIn profiles with only single name', async () => {
      const content = makeContent({
        url: 'https://linkedin.com/in/mono',
        title: 'Madonna - Chief Data Officer at TestFirm | LinkedIn',
        content: 'Profile',
      });
      mockLinkedInCollector.collectPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).not.toHaveBeenCalled();
    });

    it('skips LinkedIn profiles with name shorter than 3 chars', async () => {
      const content = makeContent({
        url: 'https://linkedin.com/in/ab',
        title: 'Ab - Chief Data Officer at TestFirm | LinkedIn',
        content: 'Profile',
      });
      mockLinkedInCollector.collectPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).not.toHaveBeenCalled();
    });

    it('skips LinkedIn profiles with unparseable title format', async () => {
      const content = makeContent({
        url: 'https://linkedin.com/in/nope',
        title: 'Just some random text no separators',
        content: 'Profile',
      });
      mockLinkedInCollector.collectPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).not.toHaveBeenCalled();
    });

    it('parses "Name - Title" patterns from website team pages', async () => {
      const content = makeWebsiteTeamContent([
        'John Smith - Chief Data Officer of Analytics',
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'John Smith',
          title: 'Chief Data Officer of Analytics',
          role_category: RoleCategory.HEAD_OF_DATA,
          confidence: 0.5,
        }),
      );
    });

    it('parses "Name\\nTitle" patterns from website team pages', async () => {
      const content = makeWebsiteTeamContent([
        'Jane Doe',
        'Chief Technology Officer & Head of Engineering',
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Jane Doe',
          title: 'Chief Technology Officer & Head of Engineering',
          role_category: RoleCategory.HEAD_OF_TECH,
        }),
      );
    });

    it('extracts email from surrounding text on website', async () => {
      const content = makeWebsiteTeamContent([
        'John Smith - Chief Data Officer of Analytics',
        'Contact: john.smith@testfirm.com',
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john.smith@testfirm.com',
        }),
      );
    });

    it('sets email to null when no email found', async () => {
      const content = makeWebsiteTeamContent([
        'John Smith - Chief Data Officer of Analytics',
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: null }),
      );
    });

    it('sets linkedinUrl to null for website sources', async () => {
      const content = makeWebsiteTeamContent([
        'John Smith - Chief Data Officer of Analytics',
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([content]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ linkedin_url: null }),
      );
    });

    it('skips people already in DB for same firm', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);
      mockPersonRepo.findOne.mockResolvedValue({
        id: 'existing',
        full_name: 'John Doe',
      });

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).not.toHaveBeenCalled();
      expect(mockPersonRepo.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'John Doe' }),
      );
    });

    it('checks person existence by firm_id and full_name', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.findOne).toHaveBeenCalledWith({
        where: { firm_id: FIRM_ID, full_name: 'John Doe' },
      });
    });

    it('handles LinkedIn collector failure gracefully', async () => {
      mockLinkedInCollector.collectPeople.mockRejectedValue(
        new Error('linkedin down'),
      );
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent([
          'John Smith - Chief Data Officer of Analytics',
        ]),
      ]);

      const result = await service.collectPeopleForFirm(FIRM_ID);

      expect(result).toBe(1);
    });

    it('handles website collector failure gracefully', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);
      mockWebsiteCollector.collectForPeople.mockRejectedValue(
        new Error('website down'),
      );

      const result = await service.collectPeopleForFirm(FIRM_ID);

      expect(result).toBe(1);
    });

    it('handles both collectors failing', async () => {
      mockLinkedInCollector.collectPeople.mockRejectedValue(new Error('fail'));
      mockWebsiteCollector.collectForPeople.mockRejectedValue(
        new Error('fail'),
      );

      const result = await service.collectPeopleForFirm(FIRM_ID);

      expect(result).toBe(0);
    });

    it('throws EntityNotFoundError when firm not found', async () => {
      mockFirmRepo.findOneByOrFail.mockRejectedValue(
        new EntityNotFoundError(Firm, { id: FIRM_ID }),
      );

      await expect(service.collectPeopleForFirm(FIRM_ID)).rejects.toThrow();
    });

    it('marks job FAILED and re-throws on error during processing', async () => {
      const error = new Error('db explosion');
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);
      mockDataSourceRepo.save.mockRejectedValueOnce(error);

      await expect(service.collectPeopleForFirm(FIRM_ID)).rejects.toThrow(
        'db explosion',
      );

      const failedJob = mockJobRepo.save.mock.calls.at(-1)?.[0];
      expect(failedJob.status).toBe(JobStatus.FAILED);
      expect(failedJob.error_message).toContain('db explosion');
      expect(failedJob.completed_at).toBeInstanceOf(Date);
    });

    it('stores non-Error thrown values as string in job', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer'),
      ]);
      mockDataSourceRepo.save.mockRejectedValueOnce('string-error');

      await expect(service.collectPeopleForFirm(FIRM_ID)).rejects.toBe(
        'string-error',
      );

      const failedJob = mockJobRepo.save.mock.calls.at(-1)?.[0];
      expect(failedJob.error_message).toBe('string-error');
    });
  });

  describe('role categorization (through collectPeopleForFirm)', () => {
    const testRole = async (
      roleTitle: string,
      expectedCategory: RoleCategory,
    ) => {
      jest.clearAllMocks();
      mockFirmRepo.findOneByOrFail.mockResolvedValue(FIRM);
      mockAliasRepo.find.mockResolvedValue([]);
      mockDataSourceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([]);
      mockSecAdvCollector.collectForPeople.mockResolvedValue([]);
      mockLlmExtractor.isEnabled.mockReturnValue(true);
      mockLlmExtractor.extractForFirm.mockResolvedValue(new Map());

      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', roleTitle),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role_category: expectedCategory }),
      );
    };

    it('maps "Chief Data Officer" to HEAD_OF_DATA', async () => {
      await testRole('Chief Data Officer', RoleCategory.HEAD_OF_DATA);
    });

    it('maps "Head of Data Science" to HEAD_OF_DATA', async () => {
      await testRole('Head of Data Science', RoleCategory.HEAD_OF_DATA);
    });

    it('maps "Chief Technology Officer" to HEAD_OF_TECH', async () => {
      await testRole('Chief Technology Officer', RoleCategory.HEAD_OF_TECH);
    });

    it('maps "CTO" to HEAD_OF_TECH', async () => {
      await testRole('CTO', RoleCategory.HEAD_OF_TECH);
    });

    it('maps "Head of Technology" to HEAD_OF_TECH', async () => {
      await testRole('Head of Tech', RoleCategory.HEAD_OF_TECH);
    });

    it('maps "Operating Partner" to OPERATING_PARTNER', async () => {
      await testRole(
        'Operating Partner, Technology',
        RoleCategory.OPERATING_PARTNER,
      );
    });

    it('maps VP of Data Analytics to OTHER (no specific mapping)', async () => {
      await testRole('VP of Data Analytics', RoleCategory.OTHER);
    });

    it('maps Director of AI Research to HEAD_OF_TECH (substring "cto" in "director")', async () => {
      await testRole('Director of AI Research', RoleCategory.HEAD_OF_TECH);
    });
  });

  describe('AI-relevant role filtering (through collectPeopleForFirm)', () => {
    const testRelevance = async (roleTitle: string, shouldCreate: boolean) => {
      jest.clearAllMocks();
      mockFirmRepo.findOneByOrFail.mockResolvedValue(FIRM);
      mockAliasRepo.find.mockResolvedValue([]);
      mockDataSourceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([]);
      mockSecAdvCollector.collectForPeople.mockResolvedValue([]);
      mockLlmExtractor.isEnabled.mockReturnValue(true);
      mockLlmExtractor.extractForFirm.mockResolvedValue(new Map());

      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', roleTitle),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      if (shouldCreate) {
        expect(mockPersonRepo.create).toHaveBeenCalled();
      } else {
        expect(mockPersonRepo.create).not.toHaveBeenCalled();
      }
    };

    it('accepts "Head of Data"', async () => {
      await testRelevance('Head of Data', true);
    });

    it('accepts "VP of AI Strategy"', async () => {
      await testRelevance('VP of AI Strategy', true);
    });

    it('accepts "Chief Technology Officer"', async () => {
      await testRelevance('Chief Technology Officer', true);
    });

    it('accepts "Machine Learning Engineer"', async () => {
      await testRelevance('Machine Learning Engineer', true);
    });

    it('accepts "Chief Digital Officer"', async () => {
      await testRelevance('Chief Digital Officer', true);
    });

    it('accepts "VP Engineering"', async () => {
      await testRelevance('VP Engineering', true);
    });

    it('accepts "Director of Analytics"', async () => {
      await testRelevance('Director of Analytics', true);
    });

    it('accepts "Chief Information Officer"', async () => {
      await testRelevance('Chief Information Officer', true);
    });

    it('accepts "Head of Innovation"', async () => {
      await testRelevance('Head of Innovation', true);
    });

    it('rejects "Sales Manager"', async () => {
      await testRelevance('Sales Manager', false);
    });

    it('accepts "Marketing Director" (substring "cto" in "director")', async () => {
      await testRelevance('Marketing Director', true);
    });

    it('rejects "General Counsel"', async () => {
      await testRelevance('General Counsel', false);
    });

    it('rejects "HR Business Partner"', async () => {
      await testRelevance('HR Business Partner', false);
    });
  });

  describe('assessReliability (through collectPeopleForFirm)', () => {
    const testReliability = async (url: string, expectedScore: number) => {
      jest.clearAllMocks();
      mockFirmRepo.findOneByOrFail.mockResolvedValue(FIRM);
      mockAliasRepo.find.mockResolvedValue([]);
      mockDataSourceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockPersonRepo.findOne.mockResolvedValue(null);
      mockLinkedInCollector.collectPeople.mockResolvedValue([]);
      mockSecAdvCollector.collectForPeople.mockResolvedValue([]);
      mockLlmExtractor.isEnabled.mockReturnValue(true);
      mockLlmExtractor.extractForFirm.mockResolvedValue(new Map());

      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeContent({ url }),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockDataSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reliability_score: expectedScore }),
      );
    };

    it('scores linkedin.com as 0.7', async () => {
      await testReliability('https://linkedin.com/in/person', 0.7);
    });

    it('scores non-linkedin URLs as 0.5', async () => {
      await testReliability('https://testfirm.com/team', 0.5);
    });
  });

  describe('email extraction (through collectPeopleForFirm)', () => {
    beforeEach(() => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([]);
    });

    it('extracts email with standard format', async () => {
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent([
          'John Smith - Chief Data Officer of Analytics',
          'john.smith@company.com',
        ]),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john.smith@company.com' }),
      );
    });

    it('extracts email with plus addressing', async () => {
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent([
          'John Smith - Chief Data Officer of Analytics',
          'john+test@company.com',
        ]),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john+test@company.com' }),
      );
    });

    it('lowercases extracted emails', async () => {
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent([
          'John Smith - Chief Data Officer of Analytics',
          'John.Smith@Company.COM',
        ]),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john.smith@company.com' }),
      );
    });

    it('never mines email from a LinkedIn snippet (LinkedIn does not expose emails)', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer', {
          content: 'Contact me at john@example.com for opportunities',
        }),
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: null }),
      );
    });

    it('returns null when no email in content', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer', {
          content: 'No contact info here',
        }),
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: null }),
      );
    });

    it('extracts obfuscated emails like "name [at] firm [dot] com"', async () => {
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent([
          'John Smith - Chief Data Officer of Analytics',
          'Contact: john [at] testfirm [dot] com',
        ]),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john@testfirm.com' }),
      );
    });

    it('pairs mailto-derived emails with people by name match', async () => {
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent(
          ['John Smith - Chief Data Officer of Analytics'],
          {
            metadata: {
              mailtoPairs: [
                {
                  email: 'jsmith@testfirm.com',
                  context: 'John Smith | Email John',
                },
              ],
            },
          },
        ),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jsmith@testfirm.com' }),
      );
    });
  });

  describe('bio extraction', () => {
    it('populates bio from LinkedIn snippet About section', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('John Doe', 'Chief Data Officer', {
          content:
            'John Doe | Chief Data Officer | About: Seasoned data executive with 20 years of experience leading analytics organisations across PE-backed companies.',
        }),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      const created = mockPersonRepo.create.mock.calls.at(-1)![0];
      expect(created.bio).toContain('Seasoned data executive');
    });

    it('populates bio from website team page paragraph', async () => {
      mockWebsiteCollector.collectForPeople.mockResolvedValue([
        makeWebsiteTeamContent([
          'John Smith - Chief Data Officer of Analytics',
          'John joined the firm in 2018 and leads all data and analytics initiatives across the portfolio companies.',
        ]),
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      const created = mockPersonRepo.create.mock.calls.at(-1)![0];
      expect(created.bio).toContain('John joined the firm');
    });
  });

  describe('SEC ADV collector integration', () => {
    it('saves people from structured parsedPeople metadata without regex', async () => {
      mockSecAdvCollector.collectForPeople.mockResolvedValue([
        {
          url: 'https://adviserinfo.sec.gov/firm/summary/1234',
          title: 'TestFirm — SEC Form ADV principals',
          content: 'Jane Doe — Managing Director',
          sourceType: 'sec_edgar',
          metadata: {
            source: 'iapd',
            firmCrd: '1234',
            parsedPeople: [
              {
                fullName: 'Jane Doe',
                title: 'Chief Data Officer',
                bio: 'Heads data strategy across all portfolio funds.',
              },
            ],
          },
        },
      ]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Jane Doe',
          title: 'Chief Data Officer',
          role_category: RoleCategory.HEAD_OF_DATA,
          bio: 'Heads data strategy across all portfolio funds.',
          email: null,
          linkedin_url: null,
          confidence: 0.85,
        }),
      );
    });

    it('passes firm.sec_crd_number to SecAdvCollector', async () => {
      mockFirmRepo.findOneByOrFail.mockResolvedValue({
        ...FIRM,
        sec_crd_number: '12345',
      });

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockSecAdvCollector.collectForPeople).toHaveBeenCalledWith(
        'TestFirm',
        '12345',
      );
    });
  });

  describe('LLM people extraction integration', () => {
    it('calls llmExtractor.extractForFirm with firm name and new content', async () => {
      const linkedinContent = makeLinkedInContent(
        'John Doe',
        'Chief Data Officer',
      );
      mockLinkedInCollector.collectPeople.mockResolvedValue([linkedinContent]);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockLlmExtractor.extractForFirm).toHaveBeenCalledWith(
        'TestFirm',
        expect.arrayContaining([
          expect.objectContaining({ url: linkedinContent.url }),
        ]),
      );
    });

    it('uses LLM-extracted people instead of regex when LLM returns results for the source', async () => {
      const websiteContent = makeWebsiteTeamContent([
        'Some unstructured marketing prose that regex would fail on.',
      ]);
      mockWebsiteCollector.collectForPeople.mockResolvedValue([websiteContent]);

      const llmMap = new Map();
      llmMap.set(websiteContent.url, [
        {
          fullName: 'Alice Wonder',
          title: 'Chief Data Officer',
          bio: 'Leads the data org and AI initiatives.',
          email: 'alice@firm.com',
          linkedinUrl: null,
          confidence: 0.9,
        },
      ]);
      mockLlmExtractor.extractForFirm.mockResolvedValue(llmMap);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Alice Wonder',
          title: 'Chief Data Officer',
          bio: 'Leads the data org and AI initiatives.',
          email: 'alice@firm.com',
          role_category: RoleCategory.HEAD_OF_DATA,
          confidence: 0.9,
        }),
      );
    });

    it('attaches the LinkedIn URL to LLM people whose source is a LinkedIn profile', async () => {
      const linkedinContent = makeLinkedInContent(
        'John Doe',
        'Chief Data Officer',
      );
      mockLinkedInCollector.collectPeople.mockResolvedValue([linkedinContent]);

      const llmMap = new Map();
      llmMap.set(linkedinContent.url, [
        {
          fullName: 'John Doe',
          title: 'Chief Data Officer',
          bio: 'About John...',
          email: null,
          linkedinUrl: null,
          confidence: 0.85,
        },
      ]);
      mockLlmExtractor.extractForFirm.mockResolvedValue(llmMap);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'John Doe',
          linkedin_url: linkedinContent.url,
        }),
      );
    });

    it('falls back to regex parsing when LLM returns no people for that source', async () => {
      mockLinkedInCollector.collectPeople.mockResolvedValue([
        makeLinkedInContent('Jane Smith', 'Head of AI'),
      ]);
      mockLlmExtractor.extractForFirm.mockResolvedValue(new Map());

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Jane Smith' }),
      );
    });

    it('skips LLM people whose role is not AI-relevant on LinkedIn sources', async () => {
      const linkedinContent = makeLinkedInContent('Bob Sales', 'Sales Manager');
      mockLinkedInCollector.collectPeople.mockResolvedValue([linkedinContent]);

      const llmMap = new Map();
      llmMap.set(linkedinContent.url, [
        {
          fullName: 'Bob Sales',
          title: 'Sales Manager',
          bio: null,
          email: null,
          linkedinUrl: null,
          confidence: 0.8,
        },
      ]);
      mockLlmExtractor.extractForFirm.mockResolvedValue(llmMap);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).not.toHaveBeenCalled();
    });

    it('SEC ADV structured data still wins over LLM results', async () => {
      const secContent = makeContent({
        url: 'https://adviserinfo.sec.gov/firm/1234',
        title: 'SEC Form ADV',
        content: 'Jane Doe — Managing Director',
        sourceType: SourceType.SEC_EDGAR,
        metadata: {
          parsedPeople: [
            {
              fullName: 'Jane Doe',
              title: 'Chief Data Officer',
              bio: 'SEC bio',
            },
          ],
        },
      });
      mockSecAdvCollector.collectForPeople.mockResolvedValue([secContent]);

      const llmMap = new Map();
      llmMap.set(secContent.url, [
        {
          fullName: 'Different Name',
          title: 'CTO',
          bio: 'LLM bio',
          email: null,
          linkedinUrl: null,
          confidence: 0.9,
        },
      ]);
      mockLlmExtractor.extractForFirm.mockResolvedValue(llmMap);

      await service.collectPeopleForFirm(FIRM_ID);

      expect(mockPersonRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Jane Doe',
          bio: 'SEC bio',
        }),
      );
      expect(mockPersonRepo.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Different Name' }),
      );
    });
  });
});
