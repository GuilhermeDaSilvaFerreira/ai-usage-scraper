import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommonLogger } from '../../../common/utils/index.js';
import { AnthropicService } from '../../../integrations/anthropic/anthropic.service.js';
import {
  LlmExtractedPerson,
  LlmPersonExtractionResponse,
  LlmPersonSource,
  OpenAIService,
} from '../../../integrations/openai/openai.service.js';
import { CollectedContent } from './collectors/news.collector.js';

const MIN_SNIPPET_CHARS = 60;
const MAX_SNIPPET_CHARS = 1800;

@Injectable()
export class LlmPeopleExtractor {
  private readonly logger = new CommonLogger(LlmPeopleExtractor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly openai: OpenAIService,
    private readonly anthropic: AnthropicService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('llm.peopleEnabled') !== false;
  }

  async extractForFirm(
    firmName: string,
    contents: CollectedContent[],
  ): Promise<Map<string, LlmExtractedPerson[]>> {
    const result = new Map<string, LlmExtractedPerson[]>();
    if (!this.isEnabled()) return result;

    const sources = this.buildSources(contents);
    if (sources.length === 0) return result;

    const provider = (
      this.config.get<string>('llm.provider') ?? 'anthropic'
    ).toLowerCase();

    this.logger.log(
      `LLM people extraction for ${firmName}: ${sources.length} source(s) via ${provider}`,
    );

    let response: LlmPersonExtractionResponse;
    try {
      response =
        provider === 'openai'
          ? await this.openai.extractPeople({ firmName, sources })
          : await this.anthropic.extractPeople({ firmName, sources });
    } catch (error) {
      this.logger.error(
        `LLM people extraction failed for ${firmName}: ${String(error)}`,
      );
      return result;
    }

    const idToUrl = new Map(sources.map((s) => [s.id, s.url]));
    for (const [sourceId, people] of Object.entries(response.bySource)) {
      const url = idToUrl.get(sourceId);
      if (!url || people.length === 0) continue;
      result.set(url, people);
    }

    this.logger.log(
      `LLM people extraction for ${firmName} produced people for ${result.size}/${sources.length} source(s)`,
    );
    return result;
  }

  // Skip sources backed by SEC ADV `parsedPeople` — already structured, so
  // sending them to the LLM would just burn tokens.
  private buildSources(contents: CollectedContent[]): LlmPersonSource[] {
    const sources: LlmPersonSource[] = [];
    contents.forEach((c, idx) => {
      const meta = (c.metadata ?? {}) as { parsedPeople?: unknown };
      if (Array.isArray(meta.parsedPeople) && meta.parsedPeople.length > 0) {
        return;
      }

      const trimmed = (c.content ?? '').trim();
      if (trimmed.length < MIN_SNIPPET_CHARS) return;

      sources.push({
        id: `s${idx}`,
        url: c.url,
        title: c.title ?? '',
        snippet: trimmed.slice(0, MAX_SNIPPET_CHARS),
        isLinkedIn: c.url.includes('linkedin.com'),
      });
    });
    return sources;
  }
}
