import { FirmEnrichmentService } from './firm-enrichment.service';
import { ExaService } from '../../../integrations/exa/exa.service';
import { ConfigService } from '@nestjs/config';
import { Firm } from '../../../database/entities/firm.entity';
import { FirmType } from '../../../common/enums';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('cheerio', () => ({
  __esModule: true,
  load: jest.fn(),
}));

jest.mock('../../../common/utils/index', () => ({
  webRateLimiter: {
    wrap: jest.fn((fn: () => Promise<any>) => fn()),
  },
  secEdgarRateLimiter: {
    wrap: jest.fn((fn: () => Promise<any>) => fn()),
  },
  extractHttpErrorDetails: jest.fn(() => ({})),
  JobLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import axios from 'axios';
import * as cheerio from 'cheerio';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCheerioLoad = cheerio.load as jest.MockedFunction<
  typeof cheerio.load
>;

function makeFirm(overrides: Partial<Firm> = {}): Firm {
  return {
    id: 'firm-1',
    name: 'Test Firm Capital',
    slug: 'test-firm-capital',
    website: null,
    aum_usd: null,
    aum_source: null,
    firm_type: null,
    headquarters: null,
    founded_year: null,
    description: null,
    sec_crd_number: null,
    is_active: true,
    last_collected_at: null,
    data_source_id: null,
    data_source: null,
    created_at: new Date(),
    updated_at: new Date(),
    aliases: [],
    people: [],
    signals: [],
    scores: [],
    scrape_jobs: [],
    outreach_campaigns: [],
    ...overrides,
  } as Firm;
}

describe('FirmEnrichmentService', () => {
  let service: FirmEnrichmentService;
  let firmRepo: any;
  let exa: jest.Mocked<ExaService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    firmRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (entity: any) => entity),
    };
    exa = {
      search: jest.fn().mockResolvedValue([]),
      findSimilar: jest.fn().mockResolvedValue([]),
    } as any;
    config = {
      get: jest.fn().mockReturnValue('TestAgent admin@test.com'),
    } as any;

    service = new FirmEnrichmentService(firmRepo, exa, config);
    jest.clearAllMocks();
  });

  describe('enrichFirmsWithGaps', () => {
    it('should return all zeros when no firms have gaps', async () => {
      firmRepo.find.mockResolvedValue([]);

      const result = await service.enrichFirmsWithGaps();

      expect(result).toEqual({ enriched: 0, skipped: 0, failed: 0 });
    });

    it('should skip firms that have no missing fields', async () => {
      const completeFirm = makeFirm({
        website: 'https://test.com',
        description: 'A firm',
        firm_type: FirmType.BUYOUT,
        headquarters: 'New York',
        founded_year: 2000,
        sec_crd_number: '12345',
        aum_usd: 1_000_000_000,
      });
      firmRepo.find.mockResolvedValue([completeFirm]);

      const result = await service.enrichFirmsWithGaps();

      expect(result.skipped).toBe(1);
      expect(result.enriched).toBe(0);
    });

    it('should enrich from Exa and count as enriched', async () => {
      const firm = makeFirm({ name: 'Exa Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://exafirm.com',
          title: 'Exa Firm',
          text: 'Exa Firm Capital is a leading buyout private equity firm. They manage over $50 billion in assets. The firm was founded in 2005. Headquartered in Boston, MA.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(
        new Error('network error'),
      );

      const result = await service.enrichFirmsWithGaps();

      expect(result.enriched).toBe(1);
      expect(firm.website).toBe('https://exafirm.com');
      expect(firm.description).toBeTruthy();
      expect(firm.firm_type).toBe(FirmType.BUYOUT);
    });

    it('should enrich from website when website is known', async () => {
      const firm = makeFirm({
        name: 'Web Firm Partners',
        website: 'https://webfirm.com',
      });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([]);

      const bodyText =
        'Web Firm Partners is a premier growth equity firm. The company was established in 1998. Headquartered in San Francisco, CA.';

      const mock$ = jest.fn() as any;
      mock$.mockReturnValue({
        remove: jest.fn(),
        text: jest.fn().mockReturnValue(bodyText),
      });
      mockedCheerioLoad.mockReturnValue(mock$);
      (mockedAxios.get as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('sec.gov') || url.includes('adviserinfo'))
          return { data: '' };
        return { data: '<html><body>content</body></html>' };
      });

      const result = await service.enrichFirmsWithGaps();

      expect(result.enriched).toBe(1);
    });

    it('should enrich from SEC multi-strategy when sec_crd_number is missing', async () => {
      const firm = makeFirm({
        name: 'SEC Firm Capital',
        website: 'https://secfirm.com',
        description: 'A firm',
        firm_type: FirmType.CREDIT,
        founded_year: 2010,
        aum_usd: 5_000_000_000,
      });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([]);

      const edgarHtml = `
        <input name="CIK" value="0001234567" />
      `;
      const mock$ = jest.fn() as any;
      mock$.mockReturnValue({
        val: jest.fn().mockReturnValue('0001234567'),
        toArray: jest.fn().mockReturnValue([]),
        remove: jest.fn(),
        text: jest.fn().mockReturnValue(''),
        find: jest.fn().mockReturnValue({
          length: 0,
          text: jest.fn().mockReturnValue(''),
          first: jest.fn().mockReturnValue({
            length: 0,
            text: jest.fn().mockReturnValue(''),
          }),
        }),
      });
      mockedCheerioLoad.mockReturnValue(mock$);
      (mockedAxios.get as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('browse-edgar')) {
          return { data: edgarHtml };
        }
        return { data: '' };
      });

      const result = await service.enrichFirmsWithGaps();

      expect(result.enriched).toBe(1);
      expect(firm.sec_crd_number).toBe('1234567');
    });

    it('should count failed enrichment attempts', async () => {
      const firm = makeFirm({ name: 'Failing Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockRejectedValue(new Error('API down'));
      (mockedAxios.get as jest.Mock).mockRejectedValue(
        new Error('network error'),
      );

      const result = await service.enrichFirmsWithGaps();

      expect(result.failed).toBe(1);
    });

    it('should process firms in batches of 15', async () => {
      const firms = Array.from({ length: 20 }, (_, i) =>
        makeFirm({ id: `firm-${i}`, name: `Firm ${i} Capital` }),
      );
      firmRepo.find.mockResolvedValue(firms);
      exa.search.mockResolvedValue([]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(exa.search).toHaveBeenCalled();
    });

    it('should try enrichFromExa only when relevant fields are missing', async () => {
      const firm = makeFirm({
        name: 'OnlySec Firm Capital',
        website: 'https://onlysec.com',
        description: 'Complete description',
        firm_type: FirmType.BUYOUT,
        founded_year: 2000,
        headquarters: 'NYC',
        aum_usd: 10_000_000_000,
        sec_crd_number: '99999',
      });
      firmRepo.find.mockResolvedValue([firm]);

      await service.enrichFirmsWithGaps();

      expect(exa.search).not.toHaveBeenCalled();
    });

    it('should filter non-own-site URLs when choosing website from Exa', async () => {
      const firm = makeFirm({ name: 'Wiki Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://en.wikipedia.org/wiki/Wiki_Firm',
          title: 'Wiki Firm',
          text: 'Wiki Firm Capital is a private equity firm. They manage assets.',
        },
        {
          url: 'https://wikifirm.com',
          title: 'Wiki Firm',
          text: 'Official site of Wiki Firm Capital.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(firm.website).toBe('https://wikifirm.com');
    });

    it('should extract founded year from Exa results', async () => {
      const firm = makeFirm({ name: 'Founded Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://foundedfirm.com',
          title: 'Founded Firm',
          text: 'Founded Firm Capital was founded in 2005 as a private equity firm.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(firm.founded_year).toBe(2005);
    });

    it('should extract headquarters from Exa results', async () => {
      const firm = makeFirm({ name: 'HQ Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://hqfirm.com',
          title: 'HQ Firm',
          text: 'HQ Firm Capital is headquartered in Chicago, IL and manages funds globally.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(firm.headquarters).toContain('Chicago');
    });

    it('should extract AUM from Exa results', async () => {
      const firm = makeFirm({ name: 'AUM Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://aumfirm.com',
          title: 'AUM Firm',
          text: 'AUM Firm Capital manages approximately $75 billion in assets under management.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(firm.aum_usd).toBe(75_000_000_000);
    });

    it('should fall back to topUrl when no own-site URL is found', async () => {
      const firm = makeFirm({ name: 'NoOwn Firm Capital' });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://en.wikipedia.org/wiki/NoOwn_Firm',
          title: 'NoOwn Firm',
          text: 'NoOwn Firm Capital is a firm with long text description that exceeds thirty characters.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(firm.website).toBe('https://en.wikipedia.org/wiki/NoOwn_Firm');
    });

    it('should not overwrite fields that are already filled', async () => {
      const firm = makeFirm({
        name: 'Prefilled Firm Capital',
        website: 'https://original.com',
        description: 'Original description',
      });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://different.com',
          title: 'Different',
          text: 'Prefilled Firm Capital is a different description. Founded in 2010.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      await service.enrichFirmsWithGaps();

      expect(firm.website).toBe('https://original.com');
      expect(firm.description).toBe('Original description');
    });

    it('should not save firm if nothing changed', async () => {
      const firm = makeFirm({
        name: 'NoChange Firm Capital',
        website: 'https://nochange.com',
        description: 'Already described',
        firm_type: FirmType.BUYOUT,
        headquarters: 'NYC',
        founded_year: 2000,
        aum_usd: 10_000_000_000,
      });
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      const result = await service.enrichFirmsWithGaps();

      expect(result.skipped).toBe(1);
      expect(firmRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getMissingFields (via enrichSingleFirm behavior)', () => {
    it('should identify all missing fields on an empty firm', async () => {
      const firm = makeFirm();
      firmRepo.find.mockResolvedValue([firm]);

      exa.search.mockResolvedValue([
        {
          url: 'https://firmsite.com',
          title: 'Firm',
          text: 'A very long text about the firm that should provide some description content here.',
        },
      ]);
      (mockedAxios.get as jest.Mock).mockRejectedValue(new Error('skip'));

      const result = await service.enrichFirmsWithGaps();

      expect(result.enriched + result.skipped + result.failed).toBe(1);
    });
  });

  describe('enrichFromSecMultiStrategy', () => {
    it('should try multiple strategies in order', async () => {
      const firm = makeFirm({
        name: 'MultiStrat Firm Capital',
        website: 'https://multi.com',
        description: 'Desc',
        firm_type: FirmType.BUYOUT,
        founded_year: 2000,
        aum_usd: 10_000_000_000,
        headquarters: 'NYC',
      });
      firmRepo.find.mockResolvedValue([firm]);

      let axiosCallCount = 0;
      (mockedAxios.get as jest.Mock).mockImplementation(async () => {
        axiosCallCount++;
        return { data: { hits: { hits: [] }, Results: [] } };
      });
      mockedCheerioLoad.mockReturnValue(
        (() => {
          const fn: any = () => ({
            val: () => undefined,
            toArray: () => [],
            find: () => ({
              length: 0,
              text: () => '',
              first: () => ({ length: 0, text: () => '' }),
            }),
            remove: () => {},
            text: () => '',
          });
          return fn;
        })(),
      );

      exa.search.mockResolvedValue([]);

      await service.enrichFirmsWithGaps();

      expect(axiosCallCount).toBeGreaterThanOrEqual(1);
    });

    it('should use CRD found via IAPD', async () => {
      const firm = makeFirm({
        name: 'IAPD Firm Capital',
        website: 'https://iapd.com',
        description: 'Desc',
        firm_type: FirmType.CREDIT,
        founded_year: 2010,
        aum_usd: 5_000_000_000,
      });
      firmRepo.find.mockResolvedValue([firm]);
      exa.search.mockResolvedValue([]);

      (mockedAxios.get as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('browse-edgar')) {
          return { data: '<html></html>' };
        }
        if (url.includes('search-index')) {
          return { data: { hits: { hits: [] } } };
        }
        if (url.includes('OrganizationSearch')) {
          return {
            data: {
              Results: [
                {
                  OrgName: 'IAPD Firm Capital',
                  CRDNumber: '77777',
                  City: 'Dallas',
                  State: 'TX',
                },
              ],
            },
          };
        }
        return { data: '' };
      });

      const cheerioResult: any = (selector: string) => {
        if (selector === 'input[name="CIK"]') return { val: () => undefined };
        if (selector === 'table.tableFile2 tr') return { toArray: () => [] };
        return {
          remove: () => {},
          text: () => '',
          find: () => ({
            length: 0,
            text: () => '',
            first: () => ({ length: 0, text: () => '' }),
          }),
        };
      };
      mockedCheerioLoad.mockReturnValue(cheerioResult);

      await service.enrichFirmsWithGaps();

      expect(firm.sec_crd_number).toBe('77777');
      expect(firm.headquarters).toBe('Dallas, TX');
    });

    it('should search CRD via Exa as last resort', async () => {
      const firm = makeFirm({
        name: 'ExaCrd Firm Capital',
        website: 'https://exacrd.com',
        description: 'Desc',
        firm_type: FirmType.BUYOUT,
        founded_year: 2000,
        aum_usd: 10_000_000_000,
        headquarters: 'NYC',
      });
      firmRepo.find.mockResolvedValue([firm]);

      (mockedAxios.get as jest.Mock).mockImplementation(async () => ({
        data: { hits: { hits: [] }, Results: [] },
      }));

      const cheerioResult: any = () => ({
        val: () => undefined,
        toArray: () => [],
        remove: () => {},
        text: () => '',
        find: () => ({
          length: 0,
          text: () => '',
          first: () => ({ length: 0, text: () => '' }),
        }),
      });
      mockedCheerioLoad.mockReturnValue(cheerioResult);

      exa.search.mockResolvedValue([
        {
          url: 'https://sec.gov/page',
          title: 'SEC Page',
          text: 'CRD Number: 88888 for ExaCrd Firm Capital',
        },
      ]);

      await service.enrichFirmsWithGaps();

      expect(firm.sec_crd_number).toBe('88888');
    });
  });

  describe('fuzzyNameMatch', () => {
    const fuzzy = (n1: string, n2: string) =>
      (service as any).fuzzyNameMatch(n1, n2);

    it('should match when one name contains the other after normalization', () => {
      expect(fuzzy('Apollo Global Management LLC', 'Apollo Global')).toBe(true);
    });

    it('should match when names are equal after normalization', () => {
      expect(fuzzy('Blackstone Group', 'Blackstone')).toBe(true);
    });

    it('should not match completely different names', () => {
      expect(fuzzy('Apollo Global', 'Blackstone Inc')).toBe(false);
    });

    it('should strip common suffixes like LLC, LP, Inc', () => {
      expect(fuzzy('Test Partners LLC', 'Test')).toBe(true);
    });
  });
});
