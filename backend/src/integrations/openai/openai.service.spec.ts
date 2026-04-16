import { ConfigService } from '@nestjs/config';
import { OpenAIService, LlmExtractionRequest } from './openai.service';

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
    configGet = jest.fn().mockReturnValue(apiKey);
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
