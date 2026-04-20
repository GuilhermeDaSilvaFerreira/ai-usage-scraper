import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { SecAdvCollector } from './sec-adv.collector';
import { SourceType } from '../../../../common/enums/index';
import * as rateLimiterModule from '../../../../common/utils/rate-limiter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest
  .spyOn(rateLimiterModule.secEdgarRateLimiter, 'wrap')
  .mockImplementation((fn: any) => fn());

const USER_AGENT = 'TestBot test@example.com';

const ORG_SEARCH_URL =
  'https://api.adviserinfo.sec.gov/Search/api/Search/OrganizationSearch';
const INDIVIDUAL_SEARCH_URL =
  'https://api.adviserinfo.sec.gov/Search/api/Search/IndividualSearch';

interface AxiosHandlers {
  orgByName?: (params: any) => any;
  orgByCrd?: (params: any) => any;
  individualSearch?: (params: any) => any;
}

function installAxiosMock(handlers: AxiosHandlers) {
  mockedAxios.get.mockImplementation((url: string, config: any) => {
    if (url === INDIVIDUAL_SEARCH_URL) {
      if (!handlers.individualSearch) {
        return Promise.resolve({ data: {} });
      }
      const result = handlers.individualSearch(config?.params);
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
    }
    if (url === ORG_SEARCH_URL) {
      const isCrdLookup = config?.params?.SearchScope === 'CRD';
      const handler = isCrdLookup ? handlers.orgByCrd : handlers.orgByName;
      if (!handler) {
        return Promise.resolve({ data: { Results: [] } });
      }
      const result = handler(config?.params);
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
    }
    return Promise.resolve({ data: {} });
  });
}

function makeIndividualSource(overrides: Record<string, any> = {}) {
  return {
    ind_firstname: 'Jane',
    ind_lastname: 'Doe',
    ind_current_employments: [
      { firm_name: 'Acme Capital', title: 'Managing Partner' },
    ],
    ...overrides,
  };
}

describe('SecAdvCollector', () => {
  let collector: SecAdvCollector;
  const configMock = {
    get: jest.fn((key: string) =>
      key === 'SEC_EDGAR_USER_AGENT' ? USER_AGENT : undefined,
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configMock.get.mockImplementation((key: string) =>
      key === 'SEC_EDGAR_USER_AGENT' ? USER_AGENT : undefined,
    );

    jest
      .spyOn(rateLimiterModule.secEdgarRateLimiter, 'wrap')
      .mockImplementation((fn: any) => fn());

    const module = await Test.createTestingModule({
      providers: [
        SecAdvCollector,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    collector = module.get(SecAdvCollector);
  });

  describe('CRD lookup', () => {
    it('returns [] when org search has no results and no stored CRD', async () => {
      installAxiosMock({
        orgByName: () => ({ data: { Results: [] } }),
      });

      const result = await collector.collectForPeople('Unknown Firm');

      expect(result).toEqual([]);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        ORG_SEARCH_URL,
        expect.objectContaining({
          params: expect.objectContaining({ SearchValue: 'Unknown Firm' }),
        }),
      );
    });

    it('reuses stored 7-digit CRD when verifyCrd resolves it (no name search)', async () => {
      installAxiosMock({
        orgByCrd: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '1234567' }] },
        }),
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Wrong', CRDNumber: '9999999' }] },
        }),
        individualSearch: () => ({
          data: {
            hits: { hits: [{ _source: makeIndividualSource() }] },
          },
        }),
      });

      const result = await collector.collectForPeople('Acme', '1234567');

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.firmCrd).toBe('1234567');

      const orgCalls = mockedAxios.get.mock.calls.filter(
        (c) => c[0] === ORG_SEARCH_URL,
      );
      // Only the verifyCrd call (with SearchScope: 'CRD'); no by-name lookup.
      expect(orgCalls).toHaveLength(1);
      expect(orgCalls[0][1]?.params?.SearchScope).toBe('CRD');
      expect(orgCalls[0][1]?.params?.SearchValue).toBe('1234567');
    });

    it('strips leading zeros from stored CRD before verifying', async () => {
      installAxiosMock({
        orgByCrd: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '123' }] },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: makeIndividualSource() }] } },
        }),
      });

      const result = await collector.collectForPeople('Acme', '0000123');

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.firmCrd).toBe('123');
    });

    it('falls back to OrganizationSearch by name when stored CRD is null', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: {
            Results: [{ OrgName: 'Acme Capital', CRDNumber: '7777' }],
          },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: makeIndividualSource() }] } },
        }),
      });

      const result = await collector.collectForPeople('Acme Capital', null);

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.firmCrd).toBe('7777');

      const orgCalls = mockedAxios.get.mock.calls.filter(
        (c) => c[0] === ORG_SEARCH_URL,
      );
      expect(orgCalls).toHaveLength(1);
      expect(orgCalls[0][1]?.params?.SearchValue).toBe('Acme Capital');
      expect(orgCalls[0][1]?.params?.SearchScope).toBe('');
    });

    it('prefers a hit that case-insensitively matches OrgName over the first hit', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: {
            Results: [
              { OrgName: 'Other Adviser LLC', CRDNumber: '111' },
              { OrgName: 'ACME CAPITAL LP', CRDNumber: '222' },
              { OrgName: 'Acme Capital Holdings', CRDNumber: '333' },
            ],
          },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: makeIndividualSource() }] } },
        }),
      });

      const result = await collector.collectForPeople('acme capital');

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.firmCrd).toBe('222');
    });

    it('falls back to first hit CRD when no substring match found', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: {
            Results: [
              { OrgName: 'Totally Different Firm', CRDNumber: '555' },
              { OrgName: 'Another Firm', CRDNumber: '666' },
            ],
          },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: makeIndividualSource() }] } },
        }),
      });

      const result = await collector.collectForPeople('Acme Capital');

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.firmCrd).toBe('555');
    });

    it('returns [] when CRD lookup fails entirely (org search throws)', async () => {
      installAxiosMock({
        orgByName: () => new Error('boom'),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toEqual([]);
    });

    it('falls back to name search when stored CRD verification fails', async () => {
      installAxiosMock({
        orgByCrd: () => new Error('not found'),
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '4242' }] },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: makeIndividualSource() }] } },
        }),
      });

      const result = await collector.collectForPeople('Acme', '9999999');

      expect(result).toHaveLength(1);
      expect(result[0].metadata?.firmCrd).toBe('4242');
    });
  });

  describe('individual search', () => {
    it('passes firmCRD param to IndividualSearch and parses ES-style envelope', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({
          data: {
            hits: {
              hits: [
                {
                  _source: makeIndividualSource({
                    ind_firstname: 'Alice',
                    ind_lastname: 'Smith',
                  }),
                },
                {
                  _source: makeIndividualSource({
                    ind_firstname: 'Bob',
                    ind_lastname: 'Jones',
                  }),
                },
              ],
            },
          },
        }),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toHaveLength(1);
      const indCall = mockedAxios.get.mock.calls.find(
        (c) => c[0] === INDIVIDUAL_SEARCH_URL,
      );
      expect(indCall).toBeDefined();
      expect(indCall![1]?.params?.firmCRD).toBe('888');

      const people = (result[0].metadata as any).parsedPeople;
      expect(people).toHaveLength(2);
      expect(people[0].fullName).toBe('Alice Smith');
      expect(people[1].fullName).toBe('Bob Jones');
    });

    it('parses flat Results array shape from IndividualSearch', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({
          data: {
            Results: [
              makeIndividualSource({
                ind_firstname: 'Carol',
                ind_lastname: 'White',
              }),
            ],
          },
        }),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toHaveLength(1);
      const people = (result[0].metadata as any).parsedPeople;
      expect(people).toHaveLength(1);
      expect(people[0].fullName).toBe('Carol White');
    });

    it('returns [] when IndividualSearch throws', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => new Error('403 Forbidden'),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toEqual([]);
    });

    it('returns [] when IndividualSearch returns no hits at all', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({ data: { hits: { hits: [] } } }),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toEqual([]);
    });

    it('caps results at MAX_INDIVIDUALS (25)', async () => {
      const hits = Array.from({ length: 30 }, (_, i) => ({
        _source: makeIndividualSource({
          ind_firstname: `First${i}`,
          ind_lastname: `Last${i}`,
        }),
      }));

      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({ data: { hits: { hits } } }),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toHaveLength(1);
      expect((result[0].metadata as any).parsedPeople).toHaveLength(25);
    });
  });

  describe('person parsing', () => {
    function setupSinglePerson(source: Record<string, any>) {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: source }] } },
        }),
      });
    }

    it('builds fullName from first/middle/last/suffix joined with single spaces', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_middlename: 'Q',
        ind_lastname: 'Public',
        ind_namesuffix: 'Jr.',
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].fullName).toBe(
        'Jane Q Public Jr.',
      );
    });

    it('skips empty middle/suffix when assembling fullName', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_middlename: '',
        ind_lastname: 'Public',
        ind_namesuffix: '   ',
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].fullName).toBe(
        'Jane Public',
      );
    });

    it('skips individuals that lack a first name', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({
          data: {
            hits: {
              hits: [
                { _source: { ind_firstname: '', ind_lastname: 'Doe' } },
                {
                  _source: {
                    ind_firstname: 'Alice',
                    ind_lastname: 'Smith',
                  },
                },
              ],
            },
          },
        }),
      });

      const result = await collector.collectForPeople('Acme');

      const people = (result[0].metadata as any).parsedPeople;
      expect(people).toHaveLength(1);
      expect(people[0].fullName).toBe('Alice Smith');
    });

    it('skips individuals that lack a last name', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({
          data: {
            hits: {
              hits: [
                { _source: { ind_firstname: 'Alice', ind_lastname: '' } },
                {
                  _source: {
                    ind_firstname: 'Bob',
                    ind_lastname: 'Jones',
                  },
                },
              ],
            },
          },
        }),
      });

      const result = await collector.collectForPeople('Acme');

      const people = (result[0].metadata as any).parsedPeople;
      expect(people).toHaveLength(1);
      expect(people[0].fullName).toBe('Bob Jones');
    });

    it('picks title from ind_current_employments[0].title', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
        ind_current_employments: [{ title: 'CIO', firm_name: 'Acme' }],
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].title).toBe('CIO');
    });

    it('picks title from ind_current_employments[0].position when title missing', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
        ind_current_employments: [{ position: 'Partner', firm_name: 'Acme' }],
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].title).toBe('Partner');
    });

    it('picks title from ind_current_employments[0].positions when title and position missing', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
        ind_current_employments: [{ positions: 'Director', firm_name: 'Acme' }],
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].title).toBe(
        'Director',
      );
    });

    it('falls back to top-level Title when no current employments', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
        Title: 'Founder',
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].title).toBe('Founder');
    });

    it('falls back to top-level Position when Title missing', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
        Position: 'Owner',
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].title).toBe('Owner');
    });

    it('returns null title when no title-like field is present', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].title).toBeNull();
    });

    it('builds bio from current employments + other_business_activities + ind_other_names', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
        ind_current_employments: [
          { title: 'Managing Partner', firm_name: 'Acme Capital' },
          { title: 'Director', firm_name: 'Other Holdings' },
        ],
        ind_other_business_activities: 'Serves on the board of XYZ.',
        ind_other_names: ['Janet Doe', 'J. Doe'],
      });

      const result = await collector.collectForPeople('Acme');
      const bio = (result[0].metadata as any).parsedPeople[0].bio as string;

      expect(bio).toContain('Current roles:');
      expect(bio).toContain('Managing Partner at Acme Capital');
      expect(bio).toContain('Director at Other Holdings');
      expect(bio).toContain('Other activities: Serves on the board of XYZ.');
      expect(bio).toContain('Also known as: Janet Doe, J. Doe.');
    });

    it('returns null bio when no bio-relevant fields present', async () => {
      setupSinglePerson({
        ind_firstname: 'Jane',
        ind_lastname: 'Doe',
      });

      const result = await collector.collectForPeople('Acme');

      expect((result[0].metadata as any).parsedPeople[0].bio).toBeNull();
    });
  });

  describe('CollectedContent shape', () => {
    it('returns one CollectedContent with SEC_EDGAR sourceType and iapd metadata', async () => {
      installAxiosMock({
        orgByName: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '888' }] },
        }),
        individualSearch: () => ({
          data: {
            hits: {
              hits: [{ _source: makeIndividualSource() }],
            },
          },
        }),
      });

      const result = await collector.collectForPeople('Acme');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          url: 'https://adviserinfo.sec.gov/firm/summary/888',
          title: 'Acme — SEC Form ADV principals',
          sourceType: SourceType.SEC_EDGAR,
          metadata: expect.objectContaining({
            source: 'iapd',
            firmCrd: '888',
            parsedPeople: expect.any(Array),
          }),
        }),
      );
      expect(result[0].content).toContain('Jane Doe');
      expect(result[0].content).toContain('Managing Partner');
    });
  });

  describe('User-Agent', () => {
    it('uses configured SEC_EDGAR_USER_AGENT on all requests', async () => {
      installAxiosMock({
        orgByCrd: () => ({
          data: { Results: [{ OrgName: 'Acme', CRDNumber: '1234567' }] },
        }),
        individualSearch: () => ({
          data: { hits: { hits: [{ _source: makeIndividualSource() }] } },
        }),
      });

      await collector.collectForPeople('Acme', '1234567');

      expect(mockedAxios.get).toHaveBeenCalled();
      for (const call of mockedAxios.get.mock.calls) {
        expect(call[1]?.headers?.['User-Agent']).toBe(USER_AGENT);
      }
    });
  });
});
