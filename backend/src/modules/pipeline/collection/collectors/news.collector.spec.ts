import { Test } from '@nestjs/testing';
import { NewsCollector, CollectedContent } from './news.collector';
import {
  ExaService,
  ExaSearchResult,
} from '../../../../integrations/exa/exa.service';
import { SourceType } from '../../../../common/enums/index';

const mockExa = { search: jest.fn() };

function makeSearchResult(
  overrides: Partial<ExaSearchResult> = {},
): ExaSearchResult {
  return {
    url: 'https://example.com/article',
    title: 'AI News',
    text: 'A'.repeat(150),
    publishedDate: '2025-06-01',
    score: 0.95,
    ...overrides,
  };
}

describe('NewsCollector', () => {
  let collector: NewsCollector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [NewsCollector, { provide: ExaService, useValue: mockExa }],
    }).compile();

    collector = module.get(NewsCollector);
    jest.clearAllMocks();
  });

  it('generates 4 queries per firm name and calls exa.search for each', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme Capital']);

    expect(mockExa.search).toHaveBeenCalledTimes(4);
    for (const call of mockExa.search.mock.calls) {
      expect(call[0]).toContain('Acme Capital');
      expect(call[1]).toEqual(
        expect.objectContaining({
          numResults: 5,
          category: 'news',
          startPublishedDate: expect.any(String),
        }),
      );
    }
  });

  it('generates queries for every firm name (multiple names)', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme Capital', 'Acme Partners']);

    expect(mockExa.search).toHaveBeenCalledTimes(8);

    const queries: string[] = mockExa.search.mock.calls.map((c: any[]) => c[0]);
    const acmeCapitalQueries = queries.filter((q) =>
      q.includes('Acme Capital'),
    );
    const acmePartnersQueries = queries.filter((q) =>
      q.includes('Acme Partners'),
    );
    expect(acmeCapitalQueries).toHaveLength(4);
    expect(acmePartnersQueries).toHaveLength(4);
  });

  it('returns CollectedContent for results with text > 100 chars', async () => {
    const result = makeSearchResult();
    mockExa.search.mockResolvedValue([result]);

    const collected = await collector.collect(['Acme']);

    expect(collected.length).toBeGreaterThanOrEqual(1);
    expect(collected[0]).toEqual(
      expect.objectContaining({
        url: result.url,
        title: result.title,
        content: result.text,
        sourceType: SourceType.NEWS,
        publishedDate: result.publishedDate,
      }),
    );
  });

  it('includes query and score in metadata', async () => {
    mockExa.search.mockResolvedValue([makeSearchResult({ score: 0.88 })]);

    const collected = await collector.collect(['Acme']);

    expect(collected[0].metadata).toEqual(
      expect.objectContaining({
        query: expect.any(String),
        score: 0.88,
      }),
    );
  });

  it('filters out results with text length <= 100', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({ text: 'short' }),
      makeSearchResult({ text: 'A'.repeat(101) }),
    ]);

    const collected = await collector.collect(['Acme']);

    const perQuery = collected.length;
    expect(perQuery).toBeGreaterThanOrEqual(4);
    collected.forEach((c) => expect(c.content.length).toBeGreaterThan(100));
  });

  it('filters out results with no text', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({ text: '' }),
      makeSearchResult({ text: undefined as any }),
    ]);

    const collected = await collector.collect(['Acme']);

    expect(collected).toHaveLength(0);
  });

  it('handles search errors gracefully and continues', async () => {
    mockExa.search
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue([makeSearchResult()]);

    const collected = await collector.collect(['Acme']);

    expect(collected.length).toBe(3);
  });

  it('returns empty array when all searches fail', async () => {
    mockExa.search.mockRejectedValue(new Error('all failed'));

    const collected = await collector.collect(['Acme']);

    expect(collected).toEqual([]);
  });

  it('returns empty array when no results', async () => {
    mockExa.search.mockResolvedValue([]);

    const collected = await collector.collect(['Acme']);

    expect(collected).toEqual([]);
  });

  it('passes a date string roughly one year ago as startPublishedDate', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme']);

    const passedDate = mockExa.search.mock.calls[0][1].startPublishedDate;
    const parsed = new Date(passedDate);
    const now = new Date();
    const diffMs = now.getTime() - parsed.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(350);
    expect(diffDays).toBeLessThan(380);
  });
});
