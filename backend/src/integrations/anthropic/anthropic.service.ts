import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmExtractedPerson,
  LlmExtractionRequest,
  LlmExtractionResponse,
  LlmPersonExtractionRequest,
  LlmPersonExtractionResponse,
  LlmPersonSource,
  normalizeExtractedPerson,
} from '../openai/openai.service.js';

const MAX_SNIPPET_CHARS = 2000;
const DEFAULT_BATCH_SIZE = 6;
const DEFAULT_MAX_TOKENS = 2000;

const PEOPLE_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured profiles of senior people at private equity, private credit, and asset management firms from web snippets (LinkedIn results, team pages, press releases, etc.).

For each input source, return the people you can identify. Always return ONLY valid JSON matching this schema:
{
  "bySource": {
    "<source.id>": [
      {
        "fullName": "First Last",
        "title": "Chief Data Officer",
        "bio": "1-3 sentence professional summary if available, else null",
        "email": "lowercase@email or null",
        "linkedinUrl": "https://linkedin.com/in/... or null",
        "confidence": 0.0
      }
    ]
  }
}

Rules:
- Only extract people who plausibly work at the named firm (or whose snippet strongly suggests they do).
- Skip people for whom you cannot determine a full first + last name.
- Bio: prefer the professional summary or "About" section if present; otherwise use the most informative 1-3 sentences. Never fabricate.
- Email: NEVER fabricate. Only return an email if it appears verbatim in the source. LinkedIn snippets virtually never contain emails — return null in that case.
- linkedinUrl: include the source URL when it is a linkedin.com/in/ profile.
- confidence: 0.85+ for direct profile pages, ~0.6 for team-page mentions, ~0.4 for indirect references.
- If a source contains no identifiable people, omit its key from "bySource" entirely.`;

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

  async extractPeople(
    request: LlmPersonExtractionRequest,
  ): Promise<LlmPersonExtractionResponse> {
    if (!this.client) {
      return { bySource: {} };
    }

    const sources = request.sources.filter(
      (s) => s.snippet && s.snippet.trim().length > 20,
    );
    if (sources.length === 0) {
      return { bySource: {} };
    }

    const batchSize =
      this.config.get<number>('llm.peopleBatchSize') ?? DEFAULT_BATCH_SIZE;

    const merged: Record<string, LlmExtractedPerson[]> = {};

    for (let i = 0; i < sources.length; i += batchSize) {
      const batch = sources.slice(i, i + batchSize);
      try {
        const response = await this.client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0,
          system: [
            {
              type: 'text',
              text: PEOPLE_EXTRACTION_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            {
              role: 'user',
              content: this.buildPeopleUserMessage(request.firmName, batch),
            },
          ],
        });

        const block = response.content[0];
        const raw = block?.type === 'text' ? block.text : null;
        if (!raw) continue;

        const parsed = this.safeParsePeopleResponse(raw);
        for (const [sourceId, people] of Object.entries(parsed)) {
          if (people.length > 0) merged[sourceId] = people;
        }
      } catch (error) {
        this.logger.error(
          `Anthropic people extraction failed for batch starting at ${i}: ${String(error)}`,
        );
      }
    }

    return { bySource: merged };
  }

  private buildPeopleUserMessage(
    firmName: string,
    sources: LlmPersonSource[],
  ): string {
    const blocks = sources.map((s) => {
      const snippet = s.snippet.slice(0, MAX_SNIPPET_CHARS);
      const tag = s.isLinkedIn ? ' [LINKEDIN PROFILE]' : '';
      return `### Source id="${s.id}"${tag}\nURL: ${s.url}\nTitle: ${s.title || '(no title)'}\nContent:\n${snippet}`;
    });

    return `Firm: ${firmName}\n\nExtract people from the following sources. Return JSON keyed by source id.\n\n${blocks.join('\n\n---\n\n')}`;
  }

  private safeParsePeopleResponse(
    raw: string,
  ): Record<string, LlmExtractedPerson[]> {
    try {
      // Claude occasionally wraps JSON in prose.
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return {};
      const parsed = JSON.parse(match[0]) as {
        bySource?: Record<string, unknown>;
      };
      const bySource = parsed.bySource;
      if (!bySource || typeof bySource !== 'object') return {};

      const cleaned: Record<string, LlmExtractedPerson[]> = {};
      for (const [id, value] of Object.entries(bySource)) {
        if (!Array.isArray(value)) continue;
        const people = value
          .filter(
            (p): p is Record<string, unknown> =>
              typeof p === 'object' && p !== null,
          )
          .map((p) => normalizeExtractedPerson(p))
          .filter((p): p is LlmExtractedPerson => p !== null);
        if (people.length > 0) cleaned[id] = people;
      }
      return cleaned;
    } catch (error) {
      this.logger.warn(
        `Failed to parse Anthropic people extraction JSON: ${String(error)}`,
      );
      return {};
    }
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string | null> {
    if (!this.client) {
      this.logger.warn('Anthropic client not configured');
      return null;
    }

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const block = response.content[0];
      return block?.type === 'text' ? block.text : null;
    } catch (error) {
      this.logger.error(`Anthropic completion failed: ${error}`);
      return null;
    }
  }
}
