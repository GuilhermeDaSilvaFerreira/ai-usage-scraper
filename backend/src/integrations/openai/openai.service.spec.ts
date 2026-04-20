import { ConfigService } from '@nestjs/config';
import {
  OpenAIService,
  LlmExtractionRequest,
  LlmPersonExtractionRequest,
} from './openai.service';

const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

describe('OpenAIService', () => {
  let service: OpenAIService;
  let configGet: jest.Mock;

  function createService(apiKey: string | undefined) {
    configGet = jest.fn((key: string) =>
      key === 'llm.openaiApiKey' ? apiKey : undefined,
    );
    const configService = { get: configGet } as unknown as ConfigService;
    return new OpenAIService(configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set client to null when no API key is configured', () => {
      service = createService(undefined);
      expect(configGet).toHaveBeenCalledWith('llm.openaiApiKey');
      expect((service as any).client).toBeNull();
    });

    it('should create OpenAI client when API key is provided', () => {
      service = createService('sk-test-key');
      expect((service as any).client).not.toBeNull();
    });
  });

  describe('extractSignals', () => {
    const request: LlmExtractionRequest = {
      content: 'Article about AI investments',
      firmName: 'Acme Capital',
      extractionPrompt: 'Extract AI signals',
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
            type: 'ai_vendor_partnership',
            data: { title: 'Partnership with OpenAI' },
            confidence: 0.85,
            reasoning: 'Press release',
          },
        ],
      };
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expected) } }],
      });

      const result = await service.extractSignals(request);

      expect(result).toEqual(expected);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 2000,
        }),
      );
    });

    it('should return empty signals when choices is empty', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({ choices: [] });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals when message content is null', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals when message is undefined', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [{ message: undefined }],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals on invalid JSON', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json {{{' } }],
      });

      const result = await service.extractSignals(request);
      expect(result).toEqual({ signals: [] });
    });

    it('should return empty signals on API error', async () => {
      service = createService('sk-test-key');
      mockCreate.mockRejectedValue(new Error('OpenAI 429'));

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

    it('returns empty map when no sources have meaningful snippets', async () => {
      service = createService('sk-test-key');
      const result = await service.extractPeople(
        buildRequest({
          sources: [
            {
              id: 's0',
              url: 'u',
              title: 't',
              snippet: 'tiny',
            },
          ],
        }),
      );
      expect(result).toEqual({ bySource: {} });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('uses gpt-4o-mini by default and JSON object response_format', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                bySource: {
                  s0: [
                    {
                      fullName: 'Jane Doe',
                      title: 'Chief Data Officer',
                      bio: 'Leads data org',
                      email: null,
                      linkedinUrl: 'https://linkedin.com/in/jane',
                      confidence: 0.9,
                    },
                  ],
                },
              }),
            },
          },
        ],
      });

      const result = await service.extractPeople(buildRequest());

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
      );
      expect(result.bySource.s0?.[0].fullName).toBe('Jane Doe');
      expect(result.bySource.s0?.[0].confidence).toBe(0.9);
    });

    it('drops people without a full first+last name', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                bySource: {
                  s0: [
                    { fullName: 'Cher', confidence: 0.9 },
                    { fullName: 'Jane Doe', confidence: 0.9 },
                  ],
                },
              }),
            },
          },
        ],
      });

      const result = await service.extractPeople(buildRequest());
      expect(result.bySource.s0).toHaveLength(1);
      expect(result.bySource.s0?.[0].fullName).toBe('Jane Doe');
    });

    it('lowercases extracted emails and discards malformed ones', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                bySource: {
                  s0: [
                    {
                      fullName: 'Jane Doe',
                      email: 'JANE.DOE@FIRM.COM',
                      confidence: 0.9,
                    },
                    {
                      fullName: 'John Doe',
                      email: 'not-an-email',
                      confidence: 0.9,
                    },
                  ],
                },
              }),
            },
          },
        ],
      });

      const result = await service.extractPeople(buildRequest());
      expect(result.bySource.s0?.[0].email).toBe('jane.doe@firm.com');
      expect(result.bySource.s0?.[1].email).toBeNull();
    });

    it('returns empty map when API throws, without crashing', async () => {
      service = createService('sk-test-key');
      mockCreate.mockRejectedValue(new Error('429 rate limit'));

      const result = await service.extractPeople(buildRequest());
      expect(result).toEqual({ bySource: {} });
    });

    it('batches sources according to llm.peopleBatchSize', async () => {
      configGet = jest.fn((key: string) => {
        if (key === 'llm.openaiApiKey') return 'sk-test-key';
        if (key === 'llm.peopleBatchSize') return 2;
        return undefined;
      });
      service = new OpenAIService({
        get: configGet,
      } as unknown as ConfigService);
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{"bySource":{}}' } }],
      });

      const sources = Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        url: `https://x.com/${i}`,
        title: 't',
        snippet: 'a fairly long snippet about a person at the firm '.repeat(2),
      }));

      await service.extractPeople({ firmName: 'Acme', sources });

      // 5 sources, batch size 2 → 3 calls.
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
        choices: [{ message: { content: 'AI-generated text' } }],
      });

      const result = await service.generateCompletion(
        'Be concise',
        'Summarize',
      );

      expect(result).toBe('AI-generated text');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.7,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: 'Be concise' },
            { role: 'user', content: 'Summarize' },
          ],
        }),
      );
    });

    it('should return null when choices array is empty', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({ choices: [] });

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });

    it('should return null when message content is null', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });

    it('should return null when message is undefined', async () => {
      service = createService('sk-test-key');
      mockCreate.mockResolvedValue({
        choices: [{ message: undefined }],
      });

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      service = createService('sk-test-key');
      mockCreate.mockRejectedValue(new Error('Network timeout'));

      const result = await service.generateCompletion('system', 'user');
      expect(result).toBeNull();
    });
  });
});
