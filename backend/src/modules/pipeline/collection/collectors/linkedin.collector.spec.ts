import { Test } from '@nestjs/testing';
import { LinkedInCollector } from './linkedin.collector';
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
    url: 'https://linkedin.com/in/johndoe',
    title: 'John Doe - CTO',
    text: 'A'.repeat(100),
    publishedDate: '2025-06-01',
    ...overrides,
  };
}

describe('LinkedInCollector', () => {
  let collector: LinkedInCollector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LinkedInCollector,
        { provide: ExaService, useValue: mockExa },
      ],
    }).compile();

    collector = module.get(LinkedInCollector);
    jest.clearAllMocks();
  });

  describe('collectPeople', () => {
    it('generates 3 queries per firm name', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectPeople(['Acme Capital']);

      expect(mockExa.search).toHaveBeenCalledTimes(3);
      for (const call of mockExa.search.mock.calls) {
        expect(call[0]).toContain('Acme Capital');
      }
    });

    it('passes includeDomains with linkedin.com and category people', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectPeople(['Acme']);

      for (const call of mockExa.search.mock.calls) {
        expect(call[1]).toEqual(
          expect.objectContaining({
            numResults: 5,
            includeDomains: ['linkedin.com'],
            category: 'people',
          }),
        );
      }
    });

    it('does not pass startPublishedDate', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectPeople(['Acme']);

      for (const call of mockExa.search.mock.calls) {
        expect(call[1].startPublishedDate).toBeUndefined();
      }
    });

    it('returns CollectedContent with sourceType LINKEDIN', async () => {
      mockExa.search.mockResolvedValue([makeSearchResult()]);

      const collected = await collector.collectPeople(['Acme']);

      expect(collected.length).toBeGreaterThanOrEqual(1);
      collected.forEach((c) => {
        expect(c.sourceType).toBe(SourceType.LINKEDIN);
        expect(c.url).toBeDefined();
        expect(c.title).toBeDefined();
        expect(c.content).toBeDefined();
      });
    });

    it('generates queries for multiple firm names', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectPeople(['Acme', 'Acme Capital']);

      expect(mockExa.search).toHaveBeenCalledTimes(6);
    });

    it('filters out results with text length <= 50', async () => {
      mockExa.search.mockResolvedValue([
        makeSearchResult({ text: 'A'.repeat(50) }),
        makeSearchResult({ text: 'A'.repeat(51) }),
      ]);

      const collected = await collector.collectPeople(['Acme']);

      collected.forEach((c) => expect(c.content.length).toBeGreaterThan(50));
    });

    it('filters out results with no text', async () => {
      mockExa.search.mockResolvedValue([makeSearchResult({ text: '' })]);

      const collected = await collector.collectPeople(['Acme']);

      expect(collected).toHaveLength(0);
    });

    it('includes query in metadata', async () => {
      mockExa.search.mockResolvedValue([makeSearchResult()]);

      const collected = await collector.collectPeople(['Acme']);

      expect(collected[0].metadata).toEqual(
        expect.objectContaining({ query: expect.any(String) }),
      );
    });
  });

  describe('collectSignals', () => {
    it('generates 3 queries per firm name', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectSignals(['Acme']);

      expect(mockExa.search).toHaveBeenCalledTimes(3);
    });

    it('passes includeDomains and startPublishedDate', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectSignals(['Acme']);

      for (const call of mockExa.search.mock.calls) {
        expect(call[1]).toEqual(
          expect.objectContaining({
            numResults: 5,
            includeDomains: ['linkedin.com'],
            startPublishedDate: expect.any(String),
          }),
        );
      }
    });

    it('passes a date roughly one year ago as startPublishedDate', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectSignals(['Acme']);

      const passedDate = mockExa.search.mock.calls[0][1].startPublishedDate;
      const parsed = new Date(passedDate);
      const now = new Date();
      const diffMs = now.getTime() - parsed.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(350);
      expect(diffDays).toBeLessThan(380);
    });

    it('returns CollectedContent with sourceType LINKEDIN', async () => {
      mockExa.search.mockResolvedValue([makeSearchResult()]);

      const collected = await collector.collectSignals(['Acme']);

      collected.forEach((c) => expect(c.sourceType).toBe(SourceType.LINKEDIN));
    });

    it('generates queries for multiple firm names', async () => {
      mockExa.search.mockResolvedValue([]);

      await collector.collectSignals(['Acme', 'Acme Capital']);

      expect(mockExa.search).toHaveBeenCalledTimes(6);
    });
  });

  describe('error handling', () => {
    it('handles search errors in collectPeople gracefully', async () => {
      mockExa.search
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue([makeSearchResult()]);

      const collected = await collector.collectPeople(['Acme']);

      expect(collected.length).toBe(2);
    });

    it('handles search errors in collectSignals gracefully', async () => {
      mockExa.search
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue([makeSearchResult()]);

      const collected = await collector.collectSignals(['Acme']);

      expect(collected.length).toBe(2);
    });

    it('returns empty when all searches fail', async () => {
      mockExa.search.mockRejectedValue(new Error('fail'));

      const people = await collector.collectPeople(['Acme']);
      const signals = await collector.collectSignals(['Acme']);

      expect(people).toEqual([]);
      expect(signals).toEqual([]);
    });

    it('returns empty when no results', async () => {
      mockExa.search.mockResolvedValue([]);

      const people = await collector.collectPeople(['Acme']);
      const signals = await collector.collectSignals(['Acme']);

      expect(people).toEqual([]);
      expect(signals).toEqual([]);
    });
  });
});
