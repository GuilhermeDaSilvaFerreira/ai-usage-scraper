jest.mock('compromise', () => {
  const mockDoc = {
    sentences: () => ({
      json: () => [] as any[],
    }),
    people: () => ({
      json: () => [] as any[],
    }),
  };
  const nlpFn = jest.fn(() => mockDoc) as any;
  return { __esModule: true, default: nlpFn };
});

import nlp from 'compromise';
import { NlpExtractor } from './nlp.extractor';
import { SignalType, ExtractionMethod } from '../../../../common/enums';
import { ExtractorInput } from '../../../../common/interfaces';

const mockNlp = nlp as jest.MockedFunction<typeof nlp>;

function makeMockDoc(sentences: any[] = [], people: any[] = []) {
  return {
    sentences: () => ({ json: () => sentences }),
    people: () => ({ json: () => people }),
  } as any;
}

describe('NlpExtractor', () => {
  let extractor: NlpExtractor;

  const baseInput: ExtractorInput = {
    content: '',
    url: 'https://example.com/article',
    sourceType: 'web',
    firmName: 'Acme Capital',
  };

  const input = (content: string, firmName?: string): ExtractorInput => ({
    ...baseInput,
    content,
    ...(firmName && { firmName }),
  });

  beforeEach(() => {
    extractor = new NlpExtractor();
    jest.clearAllMocks();
  });

  it('should have name "nlp"', () => {
    expect(extractor.name).toBe('nlp');
  });

  it('should return empty results when content has no AI keywords', () => {
    mockNlp.mockReturnValue(makeMockDoc());

    const results = extractor.extract(
      input('This is a regular article about cooking and travel.'),
    );
    expect(results).toEqual([]);
  });

  it('should detect people with tech titles and produce AI_TEAM_GROWTH', () => {
    const sentenceText =
      'John Smith, chief data officer, is leading the artificial intelligence initiative.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], [{ text: 'John Smith' }]));

    const results = extractor.extract(input(sentenceText));
    const teamGrowth = results.filter(
      (r) => r.signalType === SignalType.AI_TEAM_GROWTH,
    );
    expect(teamGrowth).toHaveLength(1);
    expect(teamGrowth[0].data.person_name).toBe('John Smith');
    expect(teamGrowth[0].data.type).toBe('person_with_tech_title');
    expect(teamGrowth[0].confidence).toBe(0.65);
    expect(teamGrowth[0].method).toBe(ExtractionMethod.NLP);
  });

  it('should skip people with names shorter than 3 characters', () => {
    const sentenceText =
      'AI chief technology officer Bo leads deep learning research.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], [{ text: 'Bo' }]));

    const results = extractor.extract(input(sentenceText));
    const teamGrowth = results.filter(
      (r) => r.signalType === SignalType.AI_TEAM_GROWTH,
    );
    expect(teamGrowth).toHaveLength(0);
  });

  it('should skip people with empty names', () => {
    const sentenceText =
      'The artificial intelligence director joined the team.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], [{ text: '' }]));

    const results = extractor.extract(input(sentenceText));
    const teamGrowth = results.filter(
      (r) => r.signalType === SignalType.AI_TEAM_GROWTH,
    );
    expect(teamGrowth).toHaveLength(0);
  });

  it('should classify sentence with firm name and hire keyword as AI_HIRING', () => {
    const sentenceText =
      'Acme Capital plans to hire a new team for machine learning projects.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const hiring = results.filter((r) => r.signalType === SignalType.AI_HIRING);
    expect(hiring).toHaveLength(1);
    expect(hiring[0].confidence).toBe(0.6);
    expect(hiring[0].data.firm_name).toBe('Acme Capital');
  });

  it('should classify sentence with appoint keyword as AI_HIRING', () => {
    const sentenceText =
      'Acme Capital will appoint a lead for artificial intelligence research.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const hiring = results.filter((r) => r.signalType === SignalType.AI_HIRING);
    expect(hiring).toHaveLength(1);
  });

  it('should classify sentence with partner keyword as AI_VENDOR_PARTNERSHIP', () => {
    const sentenceText =
      'Acme Capital will partner with a vendor for deep learning solutions.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const partnership = results.filter(
      (r) => r.signalType === SignalType.AI_VENDOR_PARTNERSHIP,
    );
    expect(partnership).toHaveLength(1);
  });

  it('should classify sentence with vendor keyword as AI_VENDOR_PARTNERSHIP', () => {
    const sentenceText =
      'Acme Capital selected a new vendor for machine learning infrastructure.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const partnership = results.filter(
      (r) => r.signalType === SignalType.AI_VENDOR_PARTNERSHIP,
    );
    expect(partnership).toHaveLength(1);
  });

  it('should classify sentence with conference keyword as AI_CONFERENCE_TALK', () => {
    const sentenceText =
      'Acme Capital attended a conference about artificial intelligence.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const conf = results.filter(
      (r) => r.signalType === SignalType.AI_CONFERENCE_TALK,
    );
    expect(conf).toHaveLength(1);
  });

  it('should classify sentence with summit keyword as AI_CONFERENCE_TALK', () => {
    const sentenceText = 'Acme Capital spoke at a summit on data science.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const conf = results.filter(
      (r) => r.signalType === SignalType.AI_CONFERENCE_TALK,
    );
    expect(conf).toHaveLength(1);
  });

  it('should classify sentence with podcast keyword as AI_PODCAST', () => {
    const sentenceText =
      'Acme Capital discussed artificial intelligence on a new podcast episode.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const podcast = results.filter(
      (r) => r.signalType === SignalType.AI_PODCAST,
    );
    expect(podcast).toHaveLength(1);
  });

  it('should classify sentence with launch keyword as AI_CASE_STUDY', () => {
    const sentenceText =
      'Acme Capital is set to launch a new generative ai product.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const caseStudy = results.filter(
      (r) => r.signalType === SignalType.AI_CASE_STUDY,
    );
    expect(caseStudy).toHaveLength(1);
  });

  it('should classify sentence with portfolio keyword as PORTFOLIO_AI_INITIATIVE', () => {
    const sentenceText =
      'Acme Capital manages its portfolio with deep learning techniques.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const portfolio = results.filter(
      (r) => r.signalType === SignalType.PORTFOLIO_AI_INITIATIVE,
    );
    expect(portfolio).toHaveLength(1);
  });

  it('should fall through to AI_NEWS_MENTION when sentence has firm name but no classification keyword', () => {
    const sentenceText =
      'Acme Capital is exploring generative ai and big data opportunities.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const classified = results.filter((r) => r.data.sentence !== undefined);
    expect(classified).toHaveLength(1);
    expect(classified[0].signalType).toBe(SignalType.AI_NEWS_MENTION);
  });

  it('should add AI_NEWS_MENTION when AI keyword count >= 3', () => {
    const content =
      'Artificial intelligence and machine learning are transforming data science in private equity.';

    mockNlp.mockReturnValue(makeMockDoc());

    const results = extractor.extract(input(content));
    const newsMention = results.filter(
      (r) =>
        r.signalType === SignalType.AI_NEWS_MENTION &&
        r.data.type === 'high_ai_keyword_density',
    );
    expect(newsMention).toHaveLength(1);
    expect(newsMention[0].data.ai_keyword_count).toBeGreaterThanOrEqual(3);
    expect(newsMention[0].data.url).toBe('https://example.com/article');
    expect(newsMention[0].method).toBe(ExtractionMethod.NLP);
  });

  it('should cap AI_NEWS_MENTION confidence at 0.8', () => {
    const keywords = Array(20).fill('artificial intelligence').join(' ');

    mockNlp.mockReturnValue(makeMockDoc());

    const results = extractor.extract(input(keywords));
    const newsMention = results.filter(
      (r) =>
        r.signalType === SignalType.AI_NEWS_MENTION &&
        r.data.type === 'high_ai_keyword_density',
    );
    expect(newsMention).toHaveLength(1);
    expect(newsMention[0].confidence).toBe(0.8);
  });

  it('should compute confidence as 0.5 + count * 0.05 for AI_NEWS_MENTION', () => {
    const content =
      'Artificial intelligence and machine learning are transforming data science in private equity.';

    mockNlp.mockReturnValue(makeMockDoc());

    const results = extractor.extract(input(content));
    const newsMention = results.find(
      (r) => r.data.type === 'high_ai_keyword_density',
    );
    expect(newsMention).toBeDefined();
    expect(newsMention!.confidence).toBe(
      Math.min(0.5 + newsMention!.data.ai_keyword_count! * 0.05, 0.8),
    );
  });

  it('should not add AI_NEWS_MENTION when keyword count < 3', () => {
    const content = 'The firm uses artificial intelligence for one project.';

    mockNlp.mockReturnValue(makeMockDoc());

    const results = extractor.extract(input(content));
    const newsMention = results.filter(
      (r) =>
        r.signalType === SignalType.AI_NEWS_MENTION &&
        r.data.type === 'high_ai_keyword_density',
    );
    expect(newsMention).toHaveLength(0);
  });

  it('should match firm name by first word', () => {
    const sentenceText =
      'Acme is launching a new artificial intelligence tool.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], []));

    const results = extractor.extract(input(sentenceText));
    const classified = results.filter((r) => r.data.sentence !== undefined);
    expect(classified).toHaveLength(1);
    expect(classified[0].signalType).toBe(SignalType.AI_CASE_STUDY);
  });

  it('should skip sentences without AI keywords', () => {
    const sentenceWithAi = 'Deep learning models are improving.';
    const sentenceWithout = 'Revenue grew by ten percent.';

    mockNlp
      .mockReturnValueOnce(
        makeMockDoc([{ text: sentenceWithAi }, { text: sentenceWithout }]),
      )
      .mockReturnValue(makeMockDoc([], []));

    const content = `${sentenceWithAi} ${sentenceWithout} Also deep learning and machine learning and artificial intelligence are used.`;
    const results = extractor.extract(input(content));

    const sentenceResults = results.filter(
      (r) => r.data.sentence !== undefined,
    );
    for (const r of sentenceResults) {
      expect(r.data.sentence).not.toBe(sentenceWithout);
    }
  });

  it('should handle person name with no tech title (no AI_TEAM_GROWTH)', () => {
    const sentenceText = 'John Smith discussed artificial intelligence trends.';

    mockNlp
      .mockReturnValueOnce(makeMockDoc([{ text: sentenceText }]))
      .mockReturnValueOnce(makeMockDoc([], [{ text: 'John Smith' }]));

    const results = extractor.extract(input(sentenceText));
    const teamGrowth = results.filter(
      (r) => r.signalType === SignalType.AI_TEAM_GROWTH,
    );
    expect(teamGrowth).toHaveLength(0);
  });
});
