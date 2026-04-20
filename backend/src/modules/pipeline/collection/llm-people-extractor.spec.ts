import { ConfigService } from '@nestjs/config';
import { LlmPeopleExtractor } from './llm-people-extractor';
import { OpenAIService } from '../../../integrations/openai/openai.service';
import { AnthropicService } from '../../../integrations/anthropic/anthropic.service';
import { CollectedContent } from './collectors/news.collector';
import { SourceType } from '../../../common/enums/index';

function makeContent(
  overrides: Partial<CollectedContent> = {},
): CollectedContent {
  return {
    url: 'https://linkedin.com/in/jane',
    title: 'Jane Doe - Chief Data Officer at TestFirm',
    content:
      'Jane Doe is the Chief Data Officer at TestFirm. She leads data science and AI initiatives across the firm.',
    sourceType: SourceType.LINKEDIN,
    publishedDate: undefined,
    metadata: {},
    ...overrides,
  };
}

function makeConfig(values: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('LlmPeopleExtractor', () => {
  const openai = {
    extractPeople: jest.fn(),
  } as unknown as OpenAIService & { extractPeople: jest.Mock };
  const anthropic = {
    extractPeople: jest.fn(),
  } as unknown as AnthropicService & { extractPeople: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty map when LLM extraction is disabled', async () => {
    const extractor = new LlmPeopleExtractor(
      makeConfig({ 'llm.peopleEnabled': false }),
      openai,
      anthropic,
    );

    const result = await extractor.extractForFirm('TestFirm', [makeContent()]);

    expect(result.size).toBe(0);
    expect(openai.extractPeople).not.toHaveBeenCalled();
    expect(anthropic.extractPeople).not.toHaveBeenCalled();
  });

  it('returns an empty map when no eligible sources are present', async () => {
    const extractor = new LlmPeopleExtractor(makeConfig({}), openai, anthropic);

    const result = await extractor.extractForFirm('TestFirm', [
      makeContent({ content: 'too short' }),
    ]);

    expect(result.size).toBe(0);
    expect(anthropic.extractPeople).not.toHaveBeenCalled();
  });

  it('skips sources that already have structured parsedPeople (SEC ADV)', async () => {
    anthropic.extractPeople.mockResolvedValue({ bySource: {} });
    const extractor = new LlmPeopleExtractor(makeConfig({}), openai, anthropic);

    await extractor.extractForFirm('TestFirm', [
      makeContent({
        url: 'https://adviserinfo.sec.gov/firm/1234',
        metadata: {
          parsedPeople: [{ fullName: 'A B', title: null, bio: null }],
        },
      }),
      makeContent(),
    ]);

    const call = anthropic.extractPeople.mock.calls[0][0];
    expect(call.sources).toHaveLength(1);
    expect(call.sources[0].url).toBe('https://linkedin.com/in/jane');
  });

  it('routes to anthropic by default and re-keys results by source URL', async () => {
    const content = makeContent();
    anthropic.extractPeople.mockResolvedValue({
      bySource: {
        s0: [
          {
            fullName: 'Jane Doe',
            title: 'Chief Data Officer',
            bio: null,
            email: null,
            linkedinUrl: null,
            confidence: 0.9,
          },
        ],
      },
    });

    const extractor = new LlmPeopleExtractor(makeConfig({}), openai, anthropic);

    const result = await extractor.extractForFirm('TestFirm', [content]);

    expect(anthropic.extractPeople).toHaveBeenCalledWith({
      firmName: 'TestFirm',
      sources: [
        expect.objectContaining({
          id: 's0',
          url: content.url,
          isLinkedIn: true,
        }),
      ],
    });
    expect(openai.extractPeople).not.toHaveBeenCalled();
    expect(result.get(content.url)).toHaveLength(1);
  });

  it('routes to openai when LLM_PROVIDER=openai', async () => {
    openai.extractPeople.mockResolvedValue({ bySource: {} });

    const extractor = new LlmPeopleExtractor(
      makeConfig({ 'llm.provider': 'openai' }),
      openai,
      anthropic,
    );

    await extractor.extractForFirm('TestFirm', [makeContent()]);

    expect(openai.extractPeople).toHaveBeenCalled();
    expect(anthropic.extractPeople).not.toHaveBeenCalled();
  });

  it('returns an empty map without throwing when the provider call rejects', async () => {
    anthropic.extractPeople.mockRejectedValue(new Error('boom'));

    const extractor = new LlmPeopleExtractor(makeConfig({}), openai, anthropic);

    const result = await extractor.extractForFirm('TestFirm', [makeContent()]);

    expect(result.size).toBe(0);
  });

  it('truncates per-source snippets to keep cost bounded', async () => {
    anthropic.extractPeople.mockResolvedValue({ bySource: {} });
    const long = 'x'.repeat(10_000);

    const extractor = new LlmPeopleExtractor(makeConfig({}), openai, anthropic);

    await extractor.extractForFirm('TestFirm', [
      makeContent({ content: long }),
    ]);

    const call = anthropic.extractPeople.mock.calls[0][0];
    expect(call.sources[0].snippet.length).toBeLessThanOrEqual(2000);
  });
});
