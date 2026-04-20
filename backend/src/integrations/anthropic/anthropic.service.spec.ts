import { ConfigService } from '@nestjs/config';
import { AnthropicService } from './anthropic.service';
import {
  LlmExtractionRequest,
  LlmPersonExtractionRequest,
} from '../openai/openai.service';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

describe('AnthropicService', () => {
  let service: AnthropicService;
  let configGet: jest.Mock;

  function createService(apiKey: string | undefined) {
    configGet = jest.fn((key: string) =>
      key === 'llm.anthropicApiKey' ? apiKey : undefined,
    );
    const configService = { get: configGet } as unknown as ConfigService;
    return new AnthropicService(configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set client to null when no API key is configured', () => {
      service = createService(undefined);
      expect(configGet).toHaveBeenCalledWith('llm.anthropicApiKey');
      expect((service as any).client).toBeNull();
    });

    it('should create Anthropic client when API key is provided', () => {
      service = createService('sk-test-key');
      expect((service as any).client).not.toBeNull();
    });
  });

  describe('extractSignals', () => {
    const request: LlmExtractionRequest = {
      content: 'Some article about AI adoption',
      firmName: 'Test Firm',
      extractionPrompt: 'Extract signals',
    };

    it('should return empty signals when client is null', async () => {
      service = createService(undefined);
      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should extract signals from valid JSON response', async () => {
      service = createService('sk-test-key');
      const expected = {
        signals: [
          {
            type: 'ai_hiring',
            data: { title: 'AI Engineer' },
            confidence: 0.9,
            reasoning: 'Job posting found',
          },
        ],
      };
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(expected) }],
      });

      const result = await service.extractSignals(request);

      expect(result).toEqual(expected);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-5',
          max_tokens: 2000,
        }),
      );
    });

    it('should extract JSON embedded in surrounding text', async () => {
      service = createService('sk-test-key');
      const payload = {
        signals: [
          {
            type: 'ai_news_mention',
            data: {},
            confidence: 0.5,
            reasoning: 'mentioned',
          },
        ],
      };
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: `Here is the result:\n${JSON.stringify(payload)}\nDone.`,
          },
        ],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual(payload);
    });

    it('should return empty signals when response has no text content', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [{ type: 'image', source: {} }],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals when response content is empty', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({ content: [] });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals when text contains no JSON', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'No JSON here, just plain text.' }],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals when JSON is invalid', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{ invalid json: }' }],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals on API error', async () => {
      service = createService('sk-test-key');
      mockCreate.mockRejectedValue(new Error('API rate limit'));

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });
  });

  describe('extractPeople', () => {
    function buildRequest(
      overrides: Partial<LlmPersonExtractionRequest> = {},
    ): LlmPersonExtractionRequest {
      return {
        firmName: 'Acme Capital',
        sources: [
          {
            id: 's0',
            url: 'https://linkedin.com/in/jane',
            title: 'Jane Doe - Chief Data Officer at Acme | LinkedIn',
            snippet:
              'Jane Doe leads data and AI initiatives at Acme Capital. About: 15+ years building ML systems.',
            isLinkedIn: true,
          },
        ],
        ...overrides,
      };
    }

    it('returns empty map when client is null', async () => {
      service = createService(undefined);
      const result = await service.extractPeople(buildRequest());
      expect(result).toEqual({ bySource: {} });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('uses claude haiku by default and marks system prompt cacheable', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              bySource: {
                s0: [
                  {
                    fullName: 'Jane Doe',
                    title: 'Chief Data Officer',
                    bio: 'Leads data',
                    email: null,
                    linkedinUrl: 'https://linkedin.com/in/jane',
                    confidence: 0.9,
                  },
                ],
              },
            }),
          },
        ],
      });

      const result = await service.extractPeople(buildRequest());

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5',
          temperature: 0,
          system: [
            expect.objectContaining({
              type: 'text',
              cache_control: { type: 'ephemeral' },
            }),
          ],
        }),
      );
      expect(result.bySource.s0?.[0].fullName).toBe('Jane Doe');
    });

    it('extracts JSON even when wrapped in surrounding prose', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: `Here you go:\n${JSON.stringify({
              bySource: {
                s0: [{ fullName: 'Jane Doe', confidence: 0.9 }],
              },
            })}\nDone.`,
          },
        ],
      });

      const result = await service.extractPeople(buildRequest());
      expect(result.bySource.s0).toHaveLength(1);
    });

    it('returns empty map on API error without throwing', async () => {
      service = createService('sk-test-key');
      mockCreate.mockRejectedValue(new Error('429'));

      const result = await service.extractPeople(buildRequest());
      expect(result).toEqual({ bySource: {} });
    });

    it('drops people without a full first+last name', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              bySource: {
                s0: [
                  { fullName: 'Cher', confidence: 0.9 },
                  { fullName: 'Jane Doe', confidence: 0.9 },
                ],
              },
            }),
          },
        ],
      });

      const result = await service.extractPeople(buildRequest());
      expect(result.bySource.s0).toHaveLength(1);
      expect(result.bySource.s0?.[0].fullName).toBe('Jane Doe');
    });

    it('batches sources according to llm.peopleBatchSize', async () => {
      configGet = jest.fn((key: string) => {
        if (key === 'llm.anthropicApiKey') return 'sk-test-key';
        if (key === 'llm.peopleBatchSize') return 2;
        return undefined;
      });
      service = new AnthropicService({
        get: configGet,
      } as unknown as ConfigService);
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"bySource":{}}' }],
      });

      const sources = Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        url: `https://x.com/${i}`,
        title: 't',
        snippet: 'a fairly long snippet about a person at the firm '.repeat(2),
      }));

      await service.extractPeople({ firmName: 'Acme', sources });

      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('generateCompletion', () => {
    it('should return null when client is null', async () => {
      service = createService(undefined);
      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return text on successful completion', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated response' }],
      });

      const result = await service.generateCompletion('Be helpful', 'Hello');

      expect(result).toBe('Generated response');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'Be helpful',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      );
    });

    it('should return null when response block is not text type', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: 't1', name: 'fn', input: {} }],
      });

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });

    it('should return null when content array is empty', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({ content: [] });

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      service = createService('sk-test-key');
      mockCreate.mockRejectedValue(new Error('Network error'));

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });
  });
});
