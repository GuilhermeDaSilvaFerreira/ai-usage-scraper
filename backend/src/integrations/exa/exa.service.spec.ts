import { ConfigService } from '@nestjs/config';
import { ExaService } from './exa.service';

const mockSearchAndContents = jest.fn();
const mockFindSimilarAndContents = jest.fn();
jest.mock('exa-js', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      searchAndContents: mockSearchAndContents,
      findSimilarAndContents: mockFindSimilarAndContents,
    })),
  };
});

jest.mock('../../common/utils/index', () => ({
  exaRateLimiter: {
    wrap: jest.fn((fn: () => Promise<any>) => fn()),
  },
}));

describe('ExaService', () => {
  let service: ExaService;
  let configGet: jest.Mock;

  function createService(apiKey: string | undefined) {
    configGet = jest.fn().mockReturnValue(apiKey);
    const configService = { get: configGet } as unknown as ConfigService;
    return new ExaService(configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set client to null when no API key is configured', () => {
      service = createService(undefined);
      expect(configGet).toHaveBeenCalledWith('scrapers.exaApiKey');
      expect((service as any).client).toBeNull();
    });

    it('should create Exa client when API key is provided', () => {
      service = createService('exa-test-key');
      expect((service as any).client).not.toBeNull();
    });
  });

  describe('search', () => {
    it('should return empty array when client is null', async () => {
      service = createService(undefined);
      const result = await service.search('AI in private equity');
      expect(result).toEqual([]);
      expect(mockSearchAndContents).not.toHaveBeenCalled();
    });

    it('should return mapped results on success', async () => {
      service = createService('exa-test-key');
      mockSearchAndContents.mockResolvedValue({
        results: [
          {
            url: 'https://example.com/article',
            title: 'AI Adoption',
            text: 'Article body text',
            publishedDate: '2024-01-15',
            author: 'John Doe',
            score: 0.95,
          },
          {
            url: 'https://example.com/post',
            title: 'PE Trends',
            text: 'Post content',
          },
        ],
      });

      const result = await service.search('AI in PE', {
        numResults: 5,
        category: 'news',
        startPublishedDate: '2024-01-01',
        includeDomains: ['example.com'],
      });

      expect(result).toEqual([
        {
          url: 'https://example.com/article',
          title: 'AI Adoption',
          text: 'Article body text',
          publishedDate: '2024-01-15',
          author: 'John Doe',
          score: 0.95,
        },
        {
          url: 'https://example.com/post',
          title: 'PE Trends',
          text: 'Post content',
          publishedDate: undefined,
          author: undefined,
          score: undefined,
        },
      ]);

      expect(mockSearchAndContents).toHaveBeenCalledWith('AI in PE', {
        numResults: 5,
        text: true,
        category: 'news',
        startPublishedDate: '2024-01-01',
        includeDomains: ['example.com'],
      });
    });

    it('should use default numResults of 10 when no options provided', async () => {
      service = createService('exa-test-key');
      mockSearchAndContents.mockResolvedValue({ results: [] });

      await service.search('query');

      expect(mockSearchAndContents).toHaveBeenCalledWith('query', {
        numResults: 10,
        text: true,
        category: undefined,
        startPublishedDate: undefined,
        includeDomains: undefined,
      });
    });

    it('should handle null results array', async () => {
      service = createService('exa-test-key');
      mockSearchAndContents.mockResolvedValue({ results: null });

      const result = await service.search('query');
      expect(result).toEqual([]);
    });

    it('should handle undefined results array', async () => {
      service = createService('exa-test-key');
      mockSearchAndContents.mockResolvedValue({});

      const result = await service.search('query');
      expect(result).toEqual([]);
    });

    it('should map missing fields to defaults', async () => {
      service = createService('exa-test-key');
      mockSearchAndContents.mockResolvedValue({
        results: [{}],
      });

      const result = await service.search('query');
      expect(result).toEqual([
        {
          url: '',
          title: '',
          text: '',
          publishedDate: undefined,
          author: undefined,
          score: undefined,
        },
      ]);
    });

    it('should return empty array on API error', async () => {
      service = createService('exa-test-key');
      mockSearchAndContents.mockRejectedValue(new Error('Exa API error'));

      const result = await service.search('query');
      expect(result).toEqual([]);
    });
  });

  describe('findSimilar', () => {
    it('should return empty array when client is null', async () => {
      service = createService(undefined);
      const result = await service.findSimilar('https://example.com');
      expect(result).toEqual([]);
      expect(mockFindSimilarAndContents).not.toHaveBeenCalled();
    });

    it('should return mapped results on success', async () => {
      service = createService('exa-test-key');
      mockFindSimilarAndContents.mockResolvedValue({
        results: [
          {
            url: 'https://similar.com/page',
            title: 'Similar Page',
            text: 'Similar content',
            publishedDate: '2024-03-01',
            author: 'Jane',
            score: 0.88,
          },
        ],
      });

      const result = await service.findSimilar('https://example.com', 3);

      expect(result).toEqual([
        {
          url: 'https://similar.com/page',
          title: 'Similar Page',
          text: 'Similar content',
          publishedDate: '2024-03-01',
          author: 'Jane',
          score: 0.88,
        },
      ]);

      expect(mockFindSimilarAndContents).toHaveBeenCalledWith(
        'https://example.com',
        { numResults: 3, text: true },
      );
    });

    it('should default to 5 results when numResults not specified', async () => {
      service = createService('exa-test-key');
      mockFindSimilarAndContents.mockResolvedValue({ results: [] });

      await service.findSimilar('https://example.com');

      expect(mockFindSimilarAndContents).toHaveBeenCalledWith(
        'https://example.com',
        { numResults: 5, text: true },
      );
    });

    it('should handle null results array', async () => {
      service = createService('exa-test-key');
      mockFindSimilarAndContents.mockResolvedValue({ results: null });

      const result = await service.findSimilar('https://example.com');
      expect(result).toEqual([]);
    });

    it('should return empty array on API error', async () => {
      service = createService('exa-test-key');
      mockFindSimilarAndContents.mockRejectedValue(new Error('Rate limited'));

      const result = await service.findSimilar('https://example.com');
      expect(result).toEqual([]);
    });
  });
});
