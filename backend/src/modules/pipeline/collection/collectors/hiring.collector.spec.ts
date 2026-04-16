import { Test } from '@nestjs/testing';
import { HiringCollector } from './hiring.collector';
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
    url: 'https://example.com/job',
    title: 'AI Engineer Job',
    text: 'A'.repeat(100),
    publishedDate: '2025-06-01',
    ...overrides,
  };
}

describe('HiringCollector', () => {
  let collector: HiringCollector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [HiringCollector, { provide: ExaService, useValue: mockExa }],
    }).compile();

    collector = module.get(HiringCollector);
    jest.clearAllMocks();
  });

  it('generates 3 queries per firm name without website', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme Capital']);

    expect(mockExa.search).toHaveBeenCalledTimes(3);
    for (const call of mockExa.search.mock.calls) {
      expect(call[0]).toContain('Acme Capital');
      expect(call[1]).toEqual(
        expect.objectContaining({
          numResults: 5,
          startPublishedDate: expect.any(String),
        }),
      );
    }
  });

  it('adds a site: query when website is provided', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme'], 'https://acme.com');

    expect(mockExa.search).toHaveBeenCalledTimes(4);
    const lastQuery = mockExa.search.mock.calls[3][0] as string;
    expect(lastQuery).toContain('site:acme.com');
  });

  it('does not add site: query when website is null', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme'], null);

    expect(mockExa.search).toHaveBeenCalledTimes(3);
  });

  it('generates queries for each firm name', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme', 'Acme Capital']);

    expect(mockExa.search).toHaveBeenCalledTimes(6);
  });

  it('returns CollectedContent with sourceType HIRING_BOARD', async () => {
    const result = makeSearchResult();
    mockExa.search.mockResolvedValue([result]);

    const collected = await collector.collect(['Acme']);

    expect(collected.length).toBeGreaterThanOrEqual(1);
    expect(collected[0]).toEqual(
      expect.objectContaining({
        url: result.url,
        title: result.title,
        content: result.text,
        sourceType: SourceType.HIRING_BOARD,
        publishedDate: result.publishedDate,
        metadata: expect.objectContaining({ query: expect.any(String) }),
      }),
    );
  });

  it('filters out results with text length <= 50', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({ text: 'A'.repeat(50) }),
      makeSearchResult({ text: 'A'.repeat(51) }),
    ]);

    const collected = await collector.collect(['Acme']);

    collected.forEach((c) => expect(c.content.length).toBeGreaterThan(50));
  });

  it('filters out results with no text', async () => {
    mockExa.search.mockResolvedValue([makeSearchResult({ text: '' })]);

    const collected = await collector.collect(['Acme']);

    expect(collected).toHaveLength(0);
  });

  it('handles search errors gracefully', async () => {
    mockExa.search
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue([makeSearchResult()]);

    const collected = await collector.collect(['Acme']);

    expect(collected.length).toBe(2);
  });

  it('returns empty array when all searches fail', async () => {
    mockExa.search.mockRejectedValue(new Error('fail'));

    const collected = await collector.collect(['Acme']);

    expect(collected).toEqual([]);
  });

  it('returns empty array when no results', async () => {
    mockExa.search.mockResolvedValue([]);

    const collected = await collector.collect(['Acme']);

    expect(collected).toEqual([]);
  });

  it('passes a date roughly 6 months ago as startPublishedDate', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme']);

    const passedDate = mockExa.search.mock.calls[0][1].startPublishedDate;
    const parsed = new Date(passedDate);
    const now = new Date();
    const diffMs = now.getTime() - parsed.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(170);
    expect(diffDays).toBeLessThan(200);
  });
});
