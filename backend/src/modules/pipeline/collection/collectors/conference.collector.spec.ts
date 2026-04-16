import { Test } from '@nestjs/testing';
import { ConferenceCollector } from './conference.collector';
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
    url: 'https://example.com/conference',
    title: 'AI Summit 2025',
    text: 'A'.repeat(150),
    publishedDate: '2025-03-01',
    author: 'Jane Doe',
    ...overrides,
  };
}

describe('ConferenceCollector', () => {
  let collector: ConferenceCollector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConferenceCollector,
        { provide: ExaService, useValue: mockExa },
      ],
    }).compile();

    collector = module.get(ConferenceCollector);
    jest.clearAllMocks();
  });

  it('generates 4 queries per firm name', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme Capital']);

    expect(mockExa.search).toHaveBeenCalledTimes(4);
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

  it('generates queries for every firm name', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme', 'Acme Capital']);

    expect(mockExa.search).toHaveBeenCalledTimes(8);
  });

  it('classifies results with "podcast" in URL as PODCAST', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({
        url: 'https://example.com/podcast/ep1',
        title: 'Interview',
      }),
    ]);

    const collected = await collector.collect(['Acme']);

    const podcasts = collected.filter(
      (c) => c.sourceType === SourceType.PODCAST,
    );
    expect(podcasts.length).toBeGreaterThanOrEqual(1);
  });

  it('classifies results with "episode" in title as PODCAST', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({
        url: 'https://example.com/show',
        title: 'Episode 42: AI talk',
      }),
    ]);

    const collected = await collector.collect(['Acme']);

    const podcasts = collected.filter(
      (c) => c.sourceType === SourceType.PODCAST,
    );
    expect(podcasts.length).toBeGreaterThanOrEqual(1);
  });

  it('classifies results with "conference" in URL as CONFERENCE', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({
        url: 'https://example.com/conference/2025',
        title: 'Tech Talk',
      }),
    ]);

    const collected = await collector.collect(['Acme']);

    const confs = collected.filter(
      (c) => c.sourceType === SourceType.CONFERENCE,
    );
    expect(confs.length).toBeGreaterThanOrEqual(1);
  });

  it('classifies results with "summit" in title as CONFERENCE', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({
        url: 'https://example.com/event',
        title: 'Data Summit 2025',
      }),
    ]);

    const collected = await collector.collect(['Acme']);

    const confs = collected.filter(
      (c) => c.sourceType === SourceType.CONFERENCE,
    );
    expect(confs.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults to CONFERENCE when no podcast/conference/summit keywords', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({
        url: 'https://example.com/whitepaper',
        title: 'AI Whitepaper',
      }),
    ]);

    const collected = await collector.collect(['Acme']);

    collected.forEach((c) => expect(c.sourceType).toBe(SourceType.CONFERENCE));
  });

  it('includes author in metadata', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({ author: 'John Smith' }),
    ]);

    const collected = await collector.collect(['Acme']);

    expect(collected[0].metadata).toEqual(
      expect.objectContaining({
        query: expect.any(String),
        author: 'John Smith',
      }),
    );
  });

  it('filters out results with text length <= 100', async () => {
    mockExa.search.mockResolvedValue([
      makeSearchResult({ text: 'short text' }),
      makeSearchResult({ text: 'A'.repeat(101) }),
    ]);

    const collected = await collector.collect(['Acme']);

    collected.forEach((c) => expect(c.content.length).toBeGreaterThan(100));
  });

  it('filters out results with no text', async () => {
    mockExa.search.mockResolvedValue([makeSearchResult({ text: '' })]);

    const collected = await collector.collect(['Acme']);

    expect(collected).toHaveLength(0);
  });

  it('handles search errors gracefully', async () => {
    mockExa.search
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue([makeSearchResult()]);

    const collected = await collector.collect(['Acme']);

    expect(collected.length).toBe(3);
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

  it('passes a date roughly 2 years ago as startPublishedDate', async () => {
    mockExa.search.mockResolvedValue([]);

    await collector.collect(['Acme']);

    const passedDate = mockExa.search.mock.calls[0][1].startPublishedDate;
    const parsed = new Date(passedDate);
    const now = new Date();
    const diffMs = now.getTime() - parsed.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(720);
    expect(diffDays).toBeLessThan(740);
  });
});
