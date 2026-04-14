import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmExtractionRequest,
  LlmExtractionResponse,
} from '../openai/openai.service.js';

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('llm.anthropicApiKey');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn(
        'llm.anthropicApiKey not set; Anthropic LLM extraction disabled',
      );
    }
  }

  async extractSignals(
    request: LlmExtractionRequest,
  ): Promise<LlmExtractionResponse> {
    if (!this.client) {
      return { signals: [] };
    }

    const systemPrompt = `You are an expert at extracting structured data about private equity firms' AI adoption from text.
Given content about the firm "${request.firmName}", extract AI-related signals.
Return ONLY valid JSON matching this schema:
{
  "signals": [
    {
      "type": "ai_hiring|ai_news_mention|ai_conference_talk|ai_vendor_partnership|ai_case_study|ai_podcast|ai_research|linkedin_ai_activity|tech_stack_signal|ai_team_growth|portfolio_ai_initiative",
      "data": { "title": "...", "description": "...", "date": "...", "people": ["..."], "details": "..." },
      "confidence": 0.0-1.0,
      "reasoning": "why this is relevant"
    }
  ]
}
If no AI-related signals are found, return {"signals": []}.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `${request.extractionPrompt}\n\n---\n\n${request.content.slice(0, 8000)}`,
          },
        ],
      });

      const raw =
        response.content[0]?.type === 'text' ? response.content[0].text : null;
      if (!raw) return { signals: [] };

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { signals: [] };

      return JSON.parse(jsonMatch[0]) as LlmExtractionResponse;
    } catch (error) {
      this.logger.error(`Anthropic extraction failed: ${error}`);
      return { signals: [] };
    }
  }
}
