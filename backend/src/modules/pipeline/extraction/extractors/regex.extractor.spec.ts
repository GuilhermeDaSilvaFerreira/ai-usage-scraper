import { RegexExtractor } from './regex.extractor';
import { SignalType, ExtractionMethod } from '../../../../common/enums';
import { ExtractorInput } from '../../../../common/interfaces';

describe('RegexExtractor', () => {
  let extractor: RegexExtractor;

  const baseInput: ExtractorInput = {
    content: '',
    url: 'https://example.com/article',
    sourceType: 'web',
    firmName: 'Acme Capital',
  };

  const input = (content: string): ExtractorInput => ({
    ...baseInput,
    content,
  });

  beforeEach(() => {
    extractor = new RegexExtractor();
  });

  it('should have name "regex"', () => {
    expect(extractor.name).toBe('regex');
  });

  it('should return empty array when content has no matches', () => {
    const results = extractor.extract(
      input('This is a completely unrelated article about cooking recipes.'),
    );
    expect(results).toEqual([]);
  });

  describe('Rule 1 – AI executive hiring', () => {
    it('should match "hired [person] as chief data officer"', () => {
      const results = extractor.extract(
        input('The firm hired Jane Smith as chief data officer last week.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_HIRING);
      expect(results[0].data.person_name).toContain('Jane Smith');
      expect(results[0].data.firm_name).toBe('Acme Capital');
      expect(results[0].confidence).toBe(0.9);
      expect(results[0].method).toBe(ExtractionMethod.REGEX);
    });

    it('should match "appointed [person] as chief technology officer"', () => {
      const results = extractor.extract(
        input('Acme Capital appointed John Doe as chief technology officer.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_HIRING);
      expect(results[0].data.person_name).toContain('John Doe');
    });

    it('should match "named [person] head of AI"', () => {
      const results = extractor.extract(
        input('The board named Alice Chen head of AI for the division.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_HIRING);
      expect(results[0].data.person_name).toContain('Alice Chen');
    });

    it('should match "promoted [person] VP of data"', () => {
      const results = extractor.extract(
        input('They promoted Bob Lee VP of data engineering this quarter.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_HIRING);
    });

    it('should match "hired [person] head of engineering"', () => {
      const results = extractor.extract(
        input('We hired Maria Garcia as head of engineering.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.context).toBe('executive_hire');
    });
  });

  describe('Rule 2 – AI vendor partnership', () => {
    it('should match "partnered with DataRobot"', () => {
      const results = extractor.extract(
        input('The company partnered with DataRobot to improve operations.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_VENDOR_PARTNERSHIP);
      expect(results[0].data.vendor_name).toBe('DataRobot');
      expect(results[0].confidence).toBe(0.85);
    });

    it('should match "deployed Snowflake"', () => {
      const results = extractor.extract(
        input('The PE firm deployed Snowflake across its data platform.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.vendor_name).toBe('Snowflake');
    });

    it('should match "selected Databricks"', () => {
      const results = extractor.extract(
        input('They selected Databricks for their analytics stack.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.vendor_name).toBe('Databricks');
    });

    it('should match "using OpenAI"', () => {
      const results = extractor.extract(
        input('The portfolio company is using OpenAI for text generation.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.vendor_name).toBe('OpenAI');
    });

    it('should match "leveraging Anthropic"', () => {
      const results = extractor.extract(
        input('The team is leveraging Anthropic for safety research.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.vendor_name).toBe('Anthropic');
    });
  });

  describe('Rule 3 – AUM mention', () => {
    it('should match "$50 billion AUM"', () => {
      const results = extractor.extract(
        input('The firm manages $50 billion assets under management.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.TECH_STACK_SIGNAL);
      expect(results[0].data.aum_mention).toBe('50');
      expect(results[0].data.type).toBe('aum_reference');
      expect(results[0].confidence).toBe(0.9);
    });

    it('should match "12.5 bn AUM"', () => {
      const results = extractor.extract(
        input('With 12.5 bn in assets under management, the fund leads.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.aum_mention).toBe('12.5');
    });

    it('should match "3B AUM"', () => {
      const results = extractor.extract(
        input('They have 3B in assets under management deployed globally.'),
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('Rule 4 – AI initiative', () => {
    it('should match "launched an AI platform"', () => {
      const results = extractor.extract(
        input('The company launched an AI platform for deal sourcing.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_CASE_STUDY);
      expect(results[0].data.context).toBe('ai_initiative');
      expect(results[0].confidence).toBe(0.8);
    });

    it('should match "built a machine learning model"', () => {
      const results = extractor.extract(
        input('Engineers built a machine learning model for fraud detection.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_CASE_STUDY);
    });

    it('should match "developed a data analytics dashboard"', () => {
      const results = extractor.extract(
        input('The team developed a data analytics dashboard for investors.'),
      );
      expect(results).toHaveLength(1);
    });

    it('should match "deploying a predictive pipeline"', () => {
      const results = extractor.extract(
        input('They are deploying a predictive pipeline for risk analysis.'),
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('Rule 5 – Job postings', () => {
    it('should match "hiring: data scientist"', () => {
      const results = extractor.extract(
        input('The firm is hiring: data scientist for quantitative research.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_HIRING);
      expect(results[0].data.context).toBe('job_posting');
      expect(results[0].confidence).toBe(0.85);
    });

    it('should match "looking for machine learning engineer"', () => {
      const results = extractor.extract(
        input('We are looking for machine learning engineer to join.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_HIRING);
    });

    it('should match "job opening: AI engineer"', () => {
      const results = extractor.extract(
        input('New job opening: AI engineer, full-time in NYC.'),
      );
      expect(results).toHaveLength(1);
    });

    it('should match "hiring: senior data scientist"', () => {
      const results = extractor.extract(
        input('We are hiring: senior data scientist for our analytics team.'),
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('Rule 6 – Conference talks', () => {
    it('should match "spoke at AI Data Summit"', () => {
      const results = extractor.extract(
        input('Our CTO spoke at AI Data Summit about ML in PE.'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.AI_CONFERENCE_TALK);
      expect(results[0].data.event).toBeTruthy();
      expect(results[0].confidence).toBe(0.85);
    });

    it('should match "presented at Private Equity Technology Conference"', () => {
      const results = extractor.extract(
        input(
          'The managing partner presented at Private Equity Technology Conference.',
        ),
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.firm_name).toBe('Acme Capital');
    });

    it('should match "keynote at Finance Forum"', () => {
      const results = extractor.extract(
        input(
          'She delivered a keynote at Finance Forum on digital transformation.',
        ),
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('Rule 7 – Portfolio AI', () => {
    it('should match "across our portfolio implementing AI"', () => {
      const results = extractor.extract(
        input(
          'We are working across our portfolio implementing AI to drive growth.',
        ),
      );
      expect(results).toHaveLength(1);
      expect(results[0].signalType).toBe(SignalType.PORTFOLIO_AI_INITIATIVE);
      expect(results[0].data.context).toBe('portfolio_ai_strategy');
      expect(results[0].confidence).toBe(0.85);
    });

    it('should match "throughout the portfolio companies, adopted AI"', () => {
      const results = extractor.extract(
        input('Throughout the portfolio companies, adopted AI for operations.'),
      );
      const portfolioResults = results.filter(
        (r) => r.signalType === SignalType.PORTFOLIO_AI_INITIATIVE,
      );
      expect(portfolioResults).toHaveLength(1);
      expect(portfolioResults[0].data.context).toBe('portfolio_ai_strategy');
    });
  });

  describe('Multiple matches', () => {
    it('should return multiple matches from the same rule', () => {
      const results = extractor.extract(
        input(
          'The firm hired Jane Doe as chief data officer. ' +
            'Later they appointed John Smith as chief technology officer.',
        ),
      );
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.signalType === SignalType.AI_HIRING)).toBe(
        true,
      );
    });

    it('should return matches from multiple different rules', () => {
      const results = extractor.extract(
        input(
          'The company partnered with Snowflake for cloud data. ' +
            'They also launched an AI platform for analytics. ' +
            'The CEO spoke at Data Analytics Conference on AI strategy.',
        ),
      );
      expect(results.length).toBeGreaterThanOrEqual(3);
      const types = results.map((r) => r.signalType);
      expect(types).toContain(SignalType.AI_VENDOR_PARTNERSHIP);
      expect(types).toContain(SignalType.AI_CASE_STUDY);
      expect(types).toContain(SignalType.AI_CONFERENCE_TALK);
    });

    it('should set method to REGEX for all results', () => {
      const results = extractor.extract(
        input(
          'Hired Alice Wu as chief AI officer. ' +
            'Deployed Databricks for ML. ' +
            '$10 billion assets under management.',
        ),
      );
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.every((r) => r.method === ExtractionMethod.REGEX)).toBe(
        true,
      );
    });
  });
});
