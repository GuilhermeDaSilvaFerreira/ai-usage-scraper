import axios from 'axios';
import { WikipediaService } from './wikipedia.service';

jest.mock('axios');

jest.mock('../../common/utils/index', () => ({
  webRateLimiter: {
    wrap: jest.fn((fn: () => Promise<unknown>) => fn()),
  },
  extractHttpErrorDetails: jest.fn((err: Error) => ({ message: err.message })),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WikipediaService', () => {
  let service: WikipediaService;
  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet = jest.fn();
    mockedAxios.create.mockReturnValue({ get: mockGet } as never);
    service = new WikipediaService();
  });

  describe('parseInfobox', () => {
    it('parses founded year, headquarters, AUM, and employees', () => {
      const wikitext = `
{{Infobox company
| name              = Apollo Global Management
| logo              = Apollo Global Management logo.svg
| founded           = {{Start date and age|1990}}
| founders          = [[Leon Black]]
| hq_location_city  = [[New York City|New York]]
| hq_location_country = U.S.
| aum               = US$523 billion (2024)
| num_employees     = 4,578 (2023)
}}
Body of article ignored.`;
      const out = service.parseInfobox(wikitext);
      expect(out.foundedYear).toBe(1990);
      expect(out.headquarters).toBe('New York, U.S.');
      expect(out.aumUsd).toBe(523_000_000_000);
      expect(out.numEmployees).toBe(4578);
    });

    it('returns empty object when no infobox present', () => {
      expect(service.parseInfobox('plain prose without infobox')).toEqual({});
    });

    it('handles nested templates and references safely', () => {
      const wikitext = `{{Infobox company
| founded = {{circa|2010}}<ref name="x">{{cite web|url=http://x.com}}</ref>
| headquarters = [[London]], [[United Kingdom|UK]]
| aum = $1.2 trillion
}}`;
      const out = service.parseInfobox(wikitext);
      expect(out.foundedYear).toBe(2010);
      expect(out.headquarters).toBe('London, UK');
      expect(out.aumUsd).toBe(1_200_000_000_000);
    });

    it('rejects unrealistic founded years', () => {
      const wikitext = `{{Infobox company
| founded = 1500
}}`;
      expect(service.parseInfobox(wikitext).foundedYear).toBeUndefined();
    });
  });

  describe('parseMoneyAmount', () => {
    it('parses USD billions', () => {
      expect(service.parseMoneyAmount('US$73.2 billion (2024)')).toBe(
        73_200_000_000,
      );
    });

    it('parses millions with M suffix', () => {
      expect(service.parseMoneyAmount('$500M')).toBe(500_000_000);
    });

    it('parses trillion', () => {
      expect(service.parseMoneyAmount('$1.5 trillion')).toBe(1_500_000_000_000);
    });

    it('rejects non-USD currencies', () => {
      expect(service.parseMoneyAmount('€500 million')).toBeUndefined();
      expect(service.parseMoneyAmount('£200 billion')).toBeUndefined();
    });

    it('returns undefined for unparseable input', () => {
      expect(service.parseMoneyAmount('large amount')).toBeUndefined();
    });
  });

  describe('getFirmInfo', () => {
    it('returns null when opensearch yields no candidates', async () => {
      mockGet.mockResolvedValueOnce({ data: ['Acme', [], [], []] });
      const out = await service.getFirmInfo('Acme Capital Partners');
      expect(out).toBeNull();
    });

    it('returns null when no candidate scores above zero', async () => {
      mockGet.mockResolvedValueOnce({
        data: ['Acme', ['Random Page'], ['unrelated topic'], []],
      });
      const out = await service.getFirmInfo('Acme Capital Partners');
      expect(out).toBeNull();
    });

    it('combines summary extract and infobox into a structured result', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: [
            'Apollo Global Management',
            ['Apollo Global Management'],
            ['American private equity firm'],
            ['https://en.wikipedia.org/wiki/Apollo_Global_Management'],
          ],
        })
        .mockResolvedValueOnce({
          data: {
            title: 'Apollo Global Management',
            extract:
              'Apollo Global Management, Inc. is an American private equity firm. It manages investments across credit, private equity, and real assets.',
            content_urls: {
              desktop: {
                page: 'https://en.wikipedia.org/wiki/Apollo_Global_Management',
              },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            parse: {
              title: 'Apollo Global Management',
              wikitext: {
                '*': `{{Infobox company
| name = Apollo Global Management
| founded = 1990
| hq_location_city = New York
| hq_location_country = U.S.
| aum = $523 billion
| num_employees = 4500
}}`,
              },
            },
          },
        });

      const out = await service.getFirmInfo('Apollo Global Management');
      expect(out).not.toBeNull();
      expect(out!.pageTitle).toBe('Apollo Global Management');
      expect(out!.url).toBe(
        'https://en.wikipedia.org/wiki/Apollo_Global_Management',
      );
      expect(out!.description).toContain('Apollo Global Management');
      expect(out!.foundedYear).toBe(1990);
      expect(out!.headquarters).toBe('New York, U.S.');
      expect(out!.aumUsd).toBe(523_000_000_000);
      expect(out!.numEmployees).toBe(4500);
    });

    it('survives when only summary succeeds', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: [
            'KKR',
            ['KKR & Co.'],
            ['American investment company'],
            ['https://en.wikipedia.org/wiki/KKR_%26_Co.'],
          ],
        })
        .mockResolvedValueOnce({
          data: {
            title: 'KKR & Co.',
            extract:
              'KKR & Co. Inc. is an American global investment company that manages multiple alternative asset classes.',
            content_urls: {
              desktop: { page: 'https://en.wikipedia.org/wiki/KKR_%26_Co.' },
            },
          },
        })
        .mockRejectedValueOnce(new Error('wikitext fetch failed'));

      const out = await service.getFirmInfo('KKR');
      expect(out).not.toBeNull();
      expect(out!.description).toContain('KKR');
      expect(out!.foundedYear).toBeUndefined();
    });

    it('returns null when both summary and wikitext fail', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: [
            'X',
            ['X (firm)'],
            ['investment firm'],
            ['https://en.wikipedia.org/wiki/X_(firm)'],
          ],
        })
        .mockRejectedValueOnce(new Error('summary failed'))
        .mockRejectedValueOnce(new Error('wikitext failed'));

      const out = await service.getFirmInfo('X');
      expect(out).toBeNull();
    });

    it('prefers exact-match candidates with company hints', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: [
            'Carlyle',
            ['Carlyle (rapper)', 'The Carlyle Group'],
            [
              'American hip-hop musician',
              'American multinational private equity firm',
            ],
            [],
          ],
        })
        .mockResolvedValueOnce({
          data: {
            title: 'The Carlyle Group',
            extract: 'The Carlyle Group is an American multinational private equity firm.',
          },
        })
        .mockResolvedValueOnce({
          data: { parse: { wikitext: { '*': '' } } },
        });

      const out = await service.getFirmInfo('The Carlyle Group');
      expect(out).not.toBeNull();
      expect(out!.pageTitle).toBe('The Carlyle Group');
    });
  });
});
