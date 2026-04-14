import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface LlmExtractionRequest {
  content: string;
  firmName: string;
  extractionPrompt: string;
}

export interface LlmExtractionResponse {
  signals: Array<{
    type: string;
    data: Record<string, any>;
    confidence: number;
    reasoning: string;
  }>;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('llm.openaiApiKey');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        'llm.openaiApiKey not set; LLM extraction fallback disabled',
      );
    }
  }

  async extractSignals(
    request: LlmExtractionRequest,
  ): Promise<LlmExtractionResponse> {
    if (!this.client) {
      return { signals: [] };
    }

    try {
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

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${request.extractionPrompt}\n\n---\n\n${request.content.slice(0, 8000)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const raw = response.choices[0]?.message?.content;
      if (!raw) return { signals: [] };

      return JSON.parse(raw) as LlmExtractionResponse;
    } catch (error) {
      this.logger.error(`OpenAI extraction failed: ${error}`);
      return { signals: [] };
    }
  }
}
