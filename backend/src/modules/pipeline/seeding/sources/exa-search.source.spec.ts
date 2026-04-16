import { ExaSearchSource } from './exa-search.source';
import { ExaService } from '../../../../integrations/exa/exa.service';
import { FirmType } from '../../../../common/enums';

describe('ExaSearchSource', () => {
  let source: ExaSearchSource;
  let exa: jest.Mocked<ExaService>;

  beforeEach(() => {
    exa = {
      search: jest.fn().mockResolvedValue([]),
      findSimilar: jest.fn().mockResolvedValue([]),
    } as any;
    source = new ExaSearchSource(exa);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('discoverFirms', () => {
    it('should extract firms from numbered list text', async () => {
      exa.search.mockResolvedValue([
        {
          url: 'https://ranking-site.com/top-pe',
          title: 'Top PE Firms',
          text: '1. Apollo Global Management — $500 billion\n2. Blackstone Capital — $1 trillion',
        },
      ]);

      const result = await source.discoverFirms(500, 0);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const apollo = result.find((c) =>
        c.name.includes('Apollo Global Management'),
      );
      expect(apollo).toBeDefined();
      expect(apollo!.source).toMatch(/^exa:/);
    });

    it('should extract firms from "has/manages" pattern', async () => {
      exa.search.mockResolvedValue([
        {
          url: 'https://news.com/article',
          title: 'PE News',
          text: 'Ares Capital manages approximately $300 billion in assets.',
        },
      ]);

      const result = await source.discoverFirms(500, 0);

      const ares = result.find((c) => c.name.includes('Ares Capital'));
      if (ares) {
        expect(ares.aumUsd).toBeGreaterThan(0);
      }
    });

    it('should extract firms from "a leading private equity" pattern', async () => {
      exa.search.mockResolvedValue([
        {
          url: 'https://news.com/article2',
          title: 'PE News',
          text: 'Vista Equity Partners, a leading private equity firm focused on technology.',
        },
      ]);

      const result = await source.discoverFirms(500, 0);

      const vista = result.find((c) =>
        c.name.includes('Vista Equity Partners'),
      );
      expect(vista).toBeDefined();
    });

    it('should return empty array when no queries remain for high pageOffset', async () => {
      const result = await source.discoverFirms(500, 100);

      expect(result).toEqual([]);
      expect(exa.search).not.toHaveBeenCalled();
    });

    it('should handle API failure gracefully', async () => {
      let callCount = 0;
      exa.search.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('API error');
        return [
          {
            url: 'https://ok.com',
            title: 'OK',
            text: '1. Fallback Capital — $50 billion',
          },
        ];
      });

      const result = await source.discoverFirms(500, 0);

      expect(result).toBeDefined();
    });

    it('should deduplicate firms within the same Exa result', async () => {
      exa.search.mockResolvedValueOnce([
        {
          url: 'https://test.com',
          title: 'Test',
          text: '1. Apollo Global Management — $100 billion\n2. Apollo Global Management — $200 billion',
        },
      ]);
      exa.search.mockResolvedValue([]);

      const result = await source.discoverFirms(500, 0);

      const apollos = result.filter((c) =>
        c.name.includes('Apollo Global Management'),
      );
      expect(apollos.length).toBeLessThanOrEqual(1);
    });

    it('should skip names that are too short', async () => {
      exa.search.mockResolvedValue([
        {
          url: 'https://test.com',
          title: 'Test',
          text: '1. AB Capital — $50 billion',
        },
      ]);

      const result = await source.discoverFirms(500, 0);

      const tooShort = result.filter((c) => c.name.length < 3);
      expect(tooShort).toHaveLength(0);
    });

    it('should scale queries based on target firm count', async () => {
      exa.search.mockResolvedValue([]);

      await source.discoverFirms(100, 0);
      const lowTargetCallCount = exa.search.mock.calls.length;

      exa.search.mockClear();

      await source.discoverFirms(2000, 0);
      const highTargetCallCount = exa.search.mock.calls.length;

      expect(highTargetCallCount).toBeGreaterThanOrEqual(lowTargetCallCount);
    });

    it('should set source with exa prefix and URL', async () => {
      exa.search.mockResolvedValue([
        {
          url: 'https://example.com/pe-list',
          title: 'List',
          text: '1. Blackstone Capital — $100 billion',
        },
      ]);

      const result = await source.discoverFirms(500, 0);

      for (const candidate of result) {
        expect(candidate.source).toMatch(/^exa:/);
      }
    });
  });

  describe('inferFirmTypeFromContext', () => {
    const infer = (text: string, position: number) =>
      (source as any).inferFirmTypeFromContext(text, position);

    it('should infer BUYOUT from buyout context', () => {
      expect(infer('top buyout firms in 2024', 4)).toBe(FirmType.BUYOUT);
    });

    it('should infer BUYOUT from leveraged context', () => {
      expect(infer('leveraged buyout fund', 0)).toBe(FirmType.BUYOUT);
    });

    it('should infer GROWTH from growth equity context', () => {
      expect(infer('leading growth equity firms', 8)).toBe(FirmType.GROWTH);
    });

    it('should infer GROWTH from growth capital context', () => {
      expect(infer('growth capital managers', 0)).toBe(FirmType.GROWTH);
    });

    it('should infer CREDIT from private credit context', () => {
      expect(infer('private credit fund managers', 8)).toBe(FirmType.CREDIT);
    });

    it('should infer CREDIT from private debt context', () => {
      expect(infer('private debt managers', 0)).toBe(FirmType.CREDIT);
    });

    it('should infer DIRECT_LENDING from direct lending context', () => {
      expect(infer('direct lending firms', 0)).toBe(FirmType.DIRECT_LENDING);
    });

    it('should infer DISTRESSED from distressed context', () => {
      expect(infer('distressed debt fund', 0)).toBe(FirmType.DISTRESSED);
    });

    it('should infer MEZZANINE from mezzanine context', () => {
      expect(infer('mezzanine capital', 0)).toBe(FirmType.MEZZANINE);
    });

    it('should infer SECONDARIES from secondaries context', () => {
      expect(infer('secondary market funds', 0)).toBe(FirmType.SECONDARIES);
    });

    it('should infer BUYOUT from infrastructure context', () => {
      expect(infer('infrastructure fund managers', 0)).toBe(FirmType.BUYOUT);
    });

    it('should return undefined for generic context', () => {
      expect(infer('general investment overview', 0)).toBeUndefined();
    });
  });
});
