import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmExtractor } from './llm.extractor';
import { SignalType, ExtractionMethod } from '../../../../common/enums';
import { ExtractorInput } from '../../../../common/interfaces';
import { OpenAIService } from '../../../../integrations/openai/openai.service';
import { AnthropicService } from '../../../../integrations/anthropic/anthropic.service';

describe('LlmExtractor', () => {
  let extractor: LlmExtractor;
  let configService: { get: jest.Mock };
  let openaiService: { extractSignals: jest.Mock };
  let anthropicService: { extractSignals: jest.Mock };

  const baseInput: ExtractorInput = {
    content: 'Acme Capital is investing in AI-driven analytics.',
    url: 'https://example.com/article',
    sourceType: 'web',
    firmName: 'Acme Capital',
  };

  beforeEach(async () => {
    configService = { get: jest.fn() };
    openaiService = { extractSignals: jest.fn() };
    anthropicService = { extractSignals: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LlmExtractor,
        { provide: ConfigService, useValue: configService },
        { provide: OpenAIService, useValue: openaiService },
        { provide: AnthropicService, useValue: anthropicService },
      ],
    }).compile();

    extractor = module.get(LlmExtractor);
  });

  it('should have name "llm"', () => {
    expect(extractor.name).toBe('llm');
  });

  it('should default to anthropic when provider config is not set', async () => {
    configService.get.mockReturnValue(undefined);
    anthropicService.extractSignals.mockResolvedValue({ signals: [] });

    await extractor.extract(baseInput);

    expect(anthropicService.extractSignals).toHaveBeenCalledTimes(1);
    expect(openaiService.extractSignals).not.toHaveBeenCalled();
  });

  it('should call anthropic when provider is "anthropic"', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({
      signals: [
        {
          type: 'ai_hiring',
          data: { role: 'data_scientist' },
          confidence: 0.7,
          reasoning: 'Job posting found',
        },
      ],
    });

    const results = await extractor.extract(baseInput);

    expect(anthropicService.extractSignals).toHaveBeenCalledTimes(1);
    expect(openaiService.extractSignals).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].signalType).toBe(SignalType.AI_HIRING);
    expect(results[0].method).toBe(ExtractionMethod.LLM);
  });

  it('should call openai when provider is "openai"', async () => {
    configService.get.mockReturnValue('openai');
    openaiService.extractSignals.mockResolvedValue({
      signals: [
        {
          type: 'ai_vendor_partnership',
          data: { vendor: 'Snowflake' },
          confidence: 0.8,
          reasoning: 'Partnership announcement',
        },
      ],
    });

    const results = await extractor.extract(baseInput);

    expect(openaiService.extractSignals).toHaveBeenCalledTimes(1);
    expect(anthropicService.extractSignals).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].signalType).toBe(SignalType.AI_VENDOR_PARTNERSHIP);
  });

  it('should handle case-insensitive provider name', async () => {
    configService.get.mockReturnValue('OpenAI');
    openaiService.extractSignals.mockResolvedValue({ signals: [] });

    await extractor.extract(baseInput);

    expect(openaiService.extractSignals).toHaveBeenCalledTimes(1);
  });

  it('should filter out unknown signal types', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({
      signals: [
        {
          type: 'ai_hiring',
          data: { role: 'engineer' },
          confidence: 0.8,
          reasoning: 'Valid signal',
        },
        {
          type: 'unknown_signal_type',
          data: { something: 'value' },
          confidence: 0.9,
          reasoning: 'Unknown signal',
        },
        {
          type: 'not_a_real_type',
          data: {},
          confidence: 0.75,
          reasoning: 'Another unknown',
        },
      ],
    });

    const results = await extractor.extract(baseInput);

    expect(results).toHaveLength(1);
    expect(results[0].signalType).toBe(SignalType.AI_HIRING);
  });

  it('should cap confidence at 0.85', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({
      signals: [
        {
          type: 'ai_case_study',
          data: { description: 'AI implementation' },
          confidence: 0.95,
          reasoning: 'Very confident',
        },
        {
          type: 'ai_hiring',
          data: { role: 'CTO' },
          confidence: 1.0,
          reasoning: 'Extremely confident',
        },
      ],
    });

    const results = await extractor.extract(baseInput);

    expect(results).toHaveLength(2);
    expect(results[0].confidence).toBe(0.85);
    expect(results[1].confidence).toBe(0.85);
  });

  it('should preserve confidence when already <= 0.85', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({
      signals: [
        {
          type: 'ai_research',
          data: { topic: 'NLP' },
          confidence: 0.6,
          reasoning: 'Research paper found',
        },
      ],
    });

    const results = await extractor.extract(baseInput);

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(0.6);
  });

  it('should return empty array when LLM returns no signals', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({ signals: [] });

    const results = await extractor.extract(baseInput);

    expect(results).toEqual([]);
  });

  it('should include llm_reasoning and firm_name in result data', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({
      signals: [
        {
          type: 'tech_stack_signal',
          data: { tool: 'Snowflake' },
          confidence: 0.7,
          reasoning: 'Tech stack identified',
        },
      ],
    });

    const results = await extractor.extract(baseInput);

    expect(results).toHaveLength(1);
    expect(results[0].data.llm_reasoning).toBe('Tech stack identified');
    expect(results[0].data.firm_name).toBe('Acme Capital');
    expect(results[0].data['tool']).toBe('Snowflake');
  });

  it('should pass correct request shape to LLM service', async () => {
    configService.get.mockReturnValue('anthropic');
    anthropicService.extractSignals.mockResolvedValue({ signals: [] });

    await extractor.extract(baseInput);

    expect(anthropicService.extractSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        content: baseInput.content,
        firmName: baseInput.firmName,
        extractionPrompt: expect.stringContaining(baseInput.firmName),
      }),
    );
  });

  it('should map all known signal types correctly', async () => {
    configService.get.mockReturnValue('anthropic');
    const knownTypes = [
      'ai_hiring',
      'ai_news_mention',
      'ai_conference_talk',
      'ai_vendor_partnership',
      'ai_case_study',
      'ai_podcast',
      'ai_research',
      'linkedin_ai_activity',
      'tech_stack_signal',
      'ai_team_growth',
      'portfolio_ai_initiative',
    ];

    anthropicService.extractSignals.mockResolvedValue({
      signals: knownTypes.map((type) => ({
        type,
        data: {},
        confidence: 0.5,
        reasoning: `Reasoning for ${type}`,
      })),
    });

    const results = await extractor.extract(baseInput);

    expect(results).toHaveLength(knownTypes.length);
    for (const result of results) {
      expect(result.method).toBe(ExtractionMethod.LLM);
    }
  });
});
