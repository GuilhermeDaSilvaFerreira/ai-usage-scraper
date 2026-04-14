import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SignalType,
  ExtractionMethod,
} from '../../../../common/enums/index.js';
import {
  ExtractionResult,
  ExtractorInput,
  Extractor,
} from '../../../../common/interfaces/index.js';
import { OpenAIService } from '../../../../integrations/openai/openai.service.js';
import { AnthropicService } from '../../../../integrations/anthropic/anthropic.service.js';

const SIGNAL_TYPE_MAP: Record<string, SignalType> = {
  ai_hiring: SignalType.AI_HIRING,
  ai_news_mention: SignalType.AI_NEWS_MENTION,
  ai_conference_talk: SignalType.AI_CONFERENCE_TALK,
  ai_vendor_partnership: SignalType.AI_VENDOR_PARTNERSHIP,
  ai_case_study: SignalType.AI_CASE_STUDY,
  ai_podcast: SignalType.AI_PODCAST,
  ai_research: SignalType.AI_RESEARCH,
  linkedin_ai_activity: SignalType.LINKEDIN_AI_ACTIVITY,
  tech_stack_signal: SignalType.TECH_STACK_SIGNAL,
  ai_team_growth: SignalType.AI_TEAM_GROWTH,
  portfolio_ai_initiative: SignalType.PORTFOLIO_AI_INITIATIVE,
};

@Injectable()
export class LlmExtractor implements Extractor {
  readonly name = 'llm';
  private readonly logger = new Logger(LlmExtractor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly openai: OpenAIService,
    private readonly anthropic: AnthropicService,
  ) {}

  async extract(input: ExtractorInput): Promise<ExtractionResult[]> {
    const provider = (
      this.config.get<string>('llm.provider') ?? 'anthropic'
    ).toLowerCase();

    this.logger.debug(
      `LLM fallback extraction for ${input.firmName} from ${input.url} using ${provider}`,
    );

    const request = {
      content: input.content,
      firmName: input.firmName,
      extractionPrompt: `Analyze this content about "${input.firmName}" and extract any signals related to AI adoption, technology investment, data capabilities, or digital transformation at this private equity or private credit firm. Focus on concrete evidence, not speculation.`,
    };

    const response =
      provider === 'openai'
        ? await this.openai.extractSignals(request)
        : await this.anthropic.extractSignals(request);

    return response.signals
      .filter((s) => s.type in SIGNAL_TYPE_MAP)
      .map((s) => ({
        signalType: SIGNAL_TYPE_MAP[s.type],
        data: {
          ...s.data,
          llm_reasoning: s.reasoning,
          firm_name: input.firmName,
        },
        confidence: Math.min(s.confidence, 0.85),
        method: ExtractionMethod.LLM,
      }));
  }
}
