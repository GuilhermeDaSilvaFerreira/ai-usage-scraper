import { HeuristicExtractor } from './heuristic.extractor';
import { SignalType, ExtractionMethod } from '../../../../common/enums';
import { ExtractorInput } from '../../../../common/interfaces';

describe('HeuristicExtractor', () => {
  let extractor: HeuristicExtractor;

  const baseInput: ExtractorInput = {
    content: '',
    url: 'https://example.com/page',
    sourceType: 'web',
    firmName: 'Acme Capital',
  };

  const input = (content: string): ExtractorInput => ({
    ...baseInput,
    content,
  });

  beforeEach(() => {
    extractor = new HeuristicExtractor();
  });

  it('should have name "heuristic"', () => {
    expect(extractor.name).toBe('heuristic');
  });

  it('should return empty array when content has no matching keywords', () => {
    const results = extractor.extract(
      input('This article is about general business strategy and growth.'),
    );
    expect(results).toEqual([]);
  });

  describe('Rule 1 – CDO / head of data (any match)', () => {
    it('should match "chief data officer"', () => {
      const results = extractor.extract(
        input('We announced a new chief data officer this quarter.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_TEAM_GROWTH);
      expect(results[0].data.role).toBe('data_leadership');
      expect(results[0].data.firm_name).toBe('Acme Capital');
      expect(results[0].method).toBe(ExtractionMethod.HEURISTIC);
    });

    it('should match "CDO"', () => {
      const results = extractor.extract(
        input('The new CDO will oversee all data initiatives.'),
      );
      expect(results.some((r) => r.data.role === 'data_leadership')).toBe(true);
    });

    it('should match "head of data"', () => {
      const results = extractor.extract(
        input('Our head of data will present next week.'),
      );
      expect(results.some((r) => r.data.role === 'data_leadership')).toBe(true);
    });
  });

  describe('Rule 2 – CTO / head of technology (any match)', () => {
    it('should match "chief technology officer"', () => {
      const results = extractor.extract(
        input('The chief technology officer joined from a startup.'),
      );
      expect(results.some((r) => r.data.role === 'tech_leadership')).toBe(true);
      expect(results[0].signalType).toBe(SignalType.AI_TEAM_GROWTH);
    });

    it('should match "CTO"', () => {
      const results = extractor.extract(
        input('Our CTO leads the engineering division.'),
      );
      expect(results.some((r) => r.data.role === 'tech_leadership')).toBe(true);
    });

    it('should match "head of technology"', () => {
      const results = extractor.extract(
        input('They brought on a new head of technology.'),
      );
      expect(results.some((r) => r.data.role === 'tech_leadership')).toBe(true);
    });
  });

  describe('Rule 3 – Operating partner + technology + digital (requireAll)', () => {
    it('should match when all three keywords are present', () => {
      const results = extractor.extract(
        input(
          'The operating partner focuses on technology and digital transformation across the fund.',
        ),
      );
      const match = results.find(
        (r) => r.data.role === 'operating_partner_tech',
      );
      expect(match).toBeDefined();
      expect(match!.signalType).toBe(SignalType.AI_TEAM_GROWTH);
    });

    it('should NOT match when only two of three keywords are present', () => {
      const results = extractor.extract(
        input('The operating partner focuses on technology improvements.'),
      );
      const match = results.find(
        (r) => r.data.role === 'operating_partner_tech',
      );
      expect(match).toBeUndefined();
    });

    it('should NOT match when only one keyword is present', () => {
      const results = extractor.extract(
        input('The operating partner is highly effective.'),
      );
      const match = results.find(
        (r) => r.data.role === 'operating_partner_tech',
      );
      expect(match).toBeUndefined();
    });
  });

  describe('Rule 4 – Data scientist / ML engineer (any match)', () => {
    it('should match "data scientist"', () => {
      const results = extractor.extract(
        input('They hired a data scientist for the quant team.'),
      );
      expect(results.some((r) => r.signalType === SignalType.AI_HIRING)).toBe(
        true,
      );
      const hiring = results.find((r) => r.signalType === SignalType.AI_HIRING);
      expect(hiring!.data.context).toBe('technical_hire');
    });

    it('should match "machine learning engineer"', () => {
      const results = extractor.extract(
        input('Looking for a machine learning engineer.'),
      );
      expect(results.some((r) => r.signalType === SignalType.AI_HIRING)).toBe(
        true,
      );
    });

    it('should match "AI engineer"', () => {
      const results = extractor.extract(
        input('The firm needs an AI engineer on the team.'),
      );
      expect(results.some((r) => r.signalType === SignalType.AI_HIRING)).toBe(
        true,
      );
    });

    it('should match "ML engineer"', () => {
      const results = extractor.extract(
        input('We are hiring an ML engineer for NLP tasks.'),
      );
      expect(results.some((r) => r.signalType === SignalType.AI_HIRING)).toBe(
        true,
      );
    });
  });

  describe('Rule 5 – Portfolio + AI + value creation (requireAll)', () => {
    it('should match when all three keywords are present', () => {
      const results = extractor.extract(
        input(
          'Our portfolio strategy leverages AI for value creation across companies.',
        ),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.PORTFOLIO_AI_INITIATIVE,
      );
      expect(match).toBeDefined();
      expect(match!.data.description).toBe(
        'Portfolio AI value creation initiative',
      );
    });

    it('should NOT match when only portfolio and AI are present', () => {
      const results = extractor.extract(
        input('Our portfolio uses AI to grow.'),
      );
      const match = results.find(
        (r) =>
          r.signalType === SignalType.PORTFOLIO_AI_INITIATIVE &&
          r.data.description === 'Portfolio AI value creation initiative',
      );
      expect(match).toBeUndefined();
    });
  });

  describe('Rule 6 – Holland Mountain / PE stack (any match)', () => {
    it('should match "Holland"', () => {
      const results = extractor.extract(
        input('Holland Mountain provided the tech stack assessment.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.TECH_STACK_SIGNAL,
      );
      expect(match).toBeDefined();
      expect(match!.data.source).toBe('holland_mountain');
    });

    it('should match "tech stack"', () => {
      const results = extractor.extract(
        input('The firm reviewed its tech stack for optimization.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.TECH_STACK_SIGNAL,
      );
      expect(match).toBeDefined();
    });

    it('should match "PE stack"', () => {
      const results = extractor.extract(
        input('They deployed a modern PE stack for operations.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.TECH_STACK_SIGNAL,
      );
      expect(match).toBeDefined();
    });
  });

  describe('Rule 7 – case study + AI + implementation (requireAll)', () => {
    it('should match when all three keywords are present', () => {
      const results = extractor.extract(
        input(
          'We published a case study on AI implementation at a portfolio company.',
        ),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.AI_CASE_STUDY,
      );
      expect(match).toBeDefined();
      expect(match!.data.description).toBe('AI implementation case study');
    });

    it('should NOT match when missing one keyword', () => {
      const results = extractor.extract(
        input('We published a case study on implementation strategy.'),
      );
      const match = results.find(
        (r) =>
          r.signalType === SignalType.AI_CASE_STUDY &&
          r.data.description === 'AI implementation case study',
      );
      expect(match).toBeUndefined();
    });
  });

  describe('Rule 8 – Research / whitepaper / AI / published (any match)', () => {
    it('should match "research"', () => {
      const results = extractor.extract(
        input('Our research team explored new methods.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.AI_RESEARCH,
      );
      expect(match).toBeDefined();
      expect(match!.data.type).toBe('research_publication');
    });

    it('should match "whitepaper"', () => {
      const results = extractor.extract(
        input('The fund released a whitepaper on digital transformation.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.AI_RESEARCH,
      );
      expect(match).toBeDefined();
    });

    it('should match "published"', () => {
      const results = extractor.extract(
        input('The team published new findings in the journal.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.AI_RESEARCH,
      );
      expect(match).toBeDefined();
    });
  });

  describe('Confidence calculation', () => {
    it('should calculate confidence as 0.5 + boost + matchedKeywords * 0.05', () => {
      const results = extractor.extract(
        input('Our chief data officer and CDO leads the head of data team.'),
      );
      const match = results.find((r) => r.data.role === 'data_leadership');
      expect(match).toBeDefined();
      expect(match!.confidence).toBe(0.8);
    });

    it('should cap confidence at 0.85', () => {
      const results = extractor.extract(
        input('Research whitepaper AI published findings in the new AI study.'),
      );
      const match = results.find(
        (r) => r.signalType === SignalType.AI_RESEARCH,
      );
      expect(match).toBeDefined();
      expect(match!.confidence).toBeLessThanOrEqual(0.85);
    });
  });

  describe('Multiple rule matches', () => {
    it('should match multiple rules from the same content', () => {
      const results = extractor.extract(
        input(
          'The chief data officer published a whitepaper. ' +
            'The firm also hired a data scientist.',
        ),
      );
      const types = new Set(results.map((r) => r.signalType));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });

    it('should set method to HEURISTIC for all results', () => {
      const results = extractor.extract(
        input(
          'The CTO discussed AI research with a data scientist from the tech stack team.',
        ),
      );
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.every((r) => r.method === ExtractionMethod.HEURISTIC),
      ).toBe(true);
    });
  });
});
