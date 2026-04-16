import { Test } from '@nestjs/testing';
import axios from 'axios';
import { WebsiteCollector } from './website.collector';
import { SourceType } from '../../../../common/enums/index';
import * as rateLimiterModule from '../../../../common/utils/rate-limiter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest
  .spyOn(rateLimiterModule.webRateLimiter, 'wrap')
  .mockImplementation((fn: any) => fn());

function htmlPage(bodyText: string): string {
  return `<html><head><title>Test</title></head><body><p>${bodyText}</p></body></html>`;
}

describe('WebsiteCollector', () => {
  let collector: WebsiteCollector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WebsiteCollector],
    }).compile();

    collector = module.get(WebsiteCollector);
    jest.clearAllMocks();

    jest
      .spyOn(rateLimiterModule.webRateLimiter, 'wrap')
      .mockImplementation((fn: any) => fn());
  });

  describe('collect', () => {
    it('returns empty array when website is undefined', async () => {
      const result = await collector.collect('Acme');

      expect(result).toEqual([]);
    });

    it('returns empty array when website is null', async () => {
      const result = await collector.collect('Acme', null);

      expect(result).toEqual([]);
    });

    it('fetches pages and returns content longer than 100 chars', async () => {
      const longText = 'A'.repeat(150);
      mockedAxios.get.mockResolvedValue({ data: htmlPage(longText) });

      const result = await collector.collect('Acme', 'https://acme.com', [
        '/about',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          url: 'https://acme.com/about',
          title: 'Acme - /about',
          sourceType: SourceType.FIRM_WEBSITE,
          metadata: { path: '/about' },
        }),
      );
      expect(result[0].content.length).toBeGreaterThan(100);
    });

    it('filters out pages with content <= 100 chars', async () => {
      mockedAxios.get.mockResolvedValue({ data: htmlPage('short') });

      const result = await collector.collect('Acme', 'https://acme.com', ['/']);

      expect(result).toHaveLength(0);
    });

    it('handles page fetch failure gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('404 Not Found'));

      const result = await collector.collect('Acme', 'https://acme.com', [
        '/missing',
      ]);

      expect(result).toHaveLength(0);
    });

    it('uses default paths (SIGNAL_PATHS + PEOPLE_PATHS) when paths not provided', async () => {
      const longText = 'A'.repeat(150);
      mockedAxios.get.mockResolvedValue({ data: htmlPage(longText) });

      await collector.collect('Acme', 'https://acme.com');

      const expectedPaths = [
        '/',
        '/about',
        '/technology',
        '/data',
        '/innovation',
        '/portfolio',
        '/team',
        '/people',
        '/leadership',
        '/about/team',
      ];
      expect(mockedAxios.get).toHaveBeenCalledTimes(expectedPaths.length);
    });

    it('uses custom paths when provided', async () => {
      const longText = 'A'.repeat(150);
      mockedAxios.get.mockResolvedValue({ data: htmlPage(longText) });

      await collector.collect('Acme', 'https://acme.com', [
        '/custom1',
        '/custom2',
      ]);

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://acme.com/custom1',
        expect.any(Object),
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://acme.com/custom2',
        expect.any(Object),
      );
    });

    it('continues collecting remaining pages when one fails', async () => {
      const longText = 'A'.repeat(150);
      mockedAxios.get
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue({ data: htmlPage(longText) });

      const result = await collector.collect('Acme', 'https://acme.com', [
        '/a',
        '/b',
      ]);

      expect(result).toHaveLength(1);
    });

    it('strips script, style, nav, footer, header elements from content', async () => {
      const html = `<html><body>
        <script>var x = 1;</script>
        <style>.foo { color: red; }</style>
        <nav>Nav content</nav>
        <header>Header content</header>
        <p>${'Real content '.repeat(20)}</p>
        <footer>Footer content</footer>
      </body></html>`;
      mockedAxios.get.mockResolvedValue({ data: html });

      const result = await collector.collect('Acme', 'https://acme.com', ['/']);

      if (result.length > 0) {
        expect(result[0].content).not.toContain('var x = 1');
        expect(result[0].content).not.toContain('Nav content');
        expect(result[0].content).not.toContain('Header content');
        expect(result[0].content).not.toContain('Footer content');
        expect(result[0].content).toContain('Real content');
      }
    });
  });

  describe('collectForSignals', () => {
    it('uses SIGNAL_PATHS', async () => {
      const longText = 'A'.repeat(150);
      mockedAxios.get.mockResolvedValue({ data: htmlPage(longText) });

      await collector.collectForSignals('Acme', 'https://acme.com');

      const signalPaths = [
        '/',
        '/about',
        '/technology',
        '/data',
        '/innovation',
        '/portfolio',
      ];
      expect(mockedAxios.get).toHaveBeenCalledTimes(signalPaths.length);
      for (const p of signalPaths) {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `https://acme.com${p}`,
          expect.any(Object),
        );
      }
    });

    it('returns empty when no website', async () => {
      const result = await collector.collectForSignals('Acme');

      expect(result).toEqual([]);
    });
  });

  describe('collectForPeople', () => {
    it('uses PEOPLE_PATHS', async () => {
      const longText = 'A'.repeat(150);
      mockedAxios.get.mockResolvedValue({ data: htmlPage(longText) });

      await collector.collectForPeople('Acme', 'https://acme.com');

      const peoplePaths = ['/team', '/people', '/leadership', '/about/team'];
      expect(mockedAxios.get).toHaveBeenCalledTimes(peoplePaths.length);
      for (const p of peoplePaths) {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `https://acme.com${p}`,
          expect.any(Object),
        );
      }
    });

    it('returns empty when no website', async () => {
      const result = await collector.collectForPeople('Acme', null);

      expect(result).toEqual([]);
    });
  });
});
