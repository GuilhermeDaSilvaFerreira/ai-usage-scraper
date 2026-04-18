import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { OutreachCampaign } from '../../../database/entities/outreach-campaign.entity.js';
import { Person } from '../../../database/entities/person.entity.js';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmSignal } from '../../../database/entities/firm-signal.entity.js';
import { FirmScore } from '../../../database/entities/firm-score.entity.js';
import { AnthropicService } from '../../../integrations/anthropic/anthropic.service.js';
import { OpenAIService } from '../../../integrations/openai/openai.service.js';

const SOAL_LABS_CONTEXT = `Soal Labs is a Data & AI Consulting firm for Private Capital. \
We guide GPs on how to modernize their operating model, and build the data & AI systems \
that bring it to life. Based in Flatiron, New York City. Website: https://www.soallabs.com/`;

@Injectable()
export class OutreachMessageService {
  private readonly logger = new Logger(OutreachMessageService.name);

  constructor(
    @InjectRepository(OutreachCampaign)
    private readonly campaignRepo: Repository<OutreachCampaign>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmSignal)
    private readonly signalRepo: Repository<FirmSignal>,
    @InjectRepository(FirmScore)
    private readonly scoreRepo: Repository<FirmScore>,
    private readonly config: ConfigService,
    private readonly anthropicService: AnthropicService,
    private readonly openaiService: OpenAIService,
  ) {}

  async generateOutreachMessage(campaignId: string): Promise<OutreachCampaign> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      relations: ['person', 'firm'],
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const person = campaign.person;
    const firm = campaign.firm;

    const context = await this.buildContext(firm);
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(person, firm, context);

    try {
      const message = await this.callLlm(systemPrompt, userPrompt);
      if (!message) {
        throw new InternalServerErrorException('LLM returned empty response');
      }

      campaign.outreach_message = message;
      await this.campaignRepo.save(campaign);

      return this.campaignRepo.findOneOrFail({
        where: { id: campaignId },
        relations: ['firm', 'person'],
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate outreach message for campaign ${campaignId}`,
        { error: error.message },
      );
      throw error instanceof InternalServerErrorException
        ? error
        : new InternalServerErrorException(
            'Failed to generate outreach message',
          );
    }
  }

  private async buildContext(firm: Firm) {
    const [signals, score] = await Promise.all([
      this.signalRepo.find({
        where: { firm_id: firm.id },
        relations: ['data_source'],
        order: { collected_at: 'DESC' },
        take: 15,
      }),
      this.scoreRepo.findOne({
        where: { firm_id: firm.id },
        order: { scored_at: 'DESC' },
      }),
    ]);

    const signalSummaries = signals.map((s) => {
      const data = s.signal_data;
      return `- [${s.signal_type}] ${data?.title || data?.description || 'Signal detected'} (confidence: ${s.extraction_confidence})`;
    });

    const dataSources = signals
      .filter((s) => s.data_source?.content_snippet)
      .slice(0, 5)
      .map(
        (s) =>
          `Source: ${s.data_source!.title || s.data_source!.url}\n${s.data_source!.content_snippet!.slice(0, 300)}`,
      );

    return {
      signalSummaries: signalSummaries.join('\n'),
      score: score
        ? `Overall AI score: ${score.overall_score}/100 (rank #${score.rank})`
        : 'No score available yet',
      dataSources: dataSources.join('\n---\n'),
    };
  }

  private buildSystemPrompt(): string {
    return `You are a senior business development professional at Soal Labs. \
Your task is to write a personalized, compelling outreach message to a key person \
at a private equity firm. The message should be concise (3-5 short paragraphs), \
professional, and demonstrate specific knowledge about the firm's AI initiatives \
and the person's role. The tone should be warm but not overly familiar — like a \
thoughtful introduction from a peer.

About Soal Labs:
${SOAL_LABS_CONTEXT}

Guidelines:
- Reference specific AI signals or initiatives at their firm to show you've done your research
- Connect the person's role to how Soal Labs can specifically help them
- Include a clear but soft call-to-action (e.g., suggesting a brief call or sharing a relevant insight)
- Do NOT use generic sales language or buzzwords
- Do NOT include subject lines, email headers, or sign-offs — just the message body
- Keep it under 200 words to respect their time`;
  }

  private buildUserPrompt(
    person: Person,
    firm: Firm,
    context: {
      signalSummaries: string;
      score: string;
      dataSources: string;
    },
  ): string {
    const parts = [
      `PERSON: ${person.full_name}`,
      person.title ? `TITLE: ${person.title}` : null,
      person.role_category ? `ROLE: ${person.role_category}` : null,
      person.bio ? `BIO: ${person.bio.slice(0, 300)}` : null,
      '',
      `FIRM: ${firm.name}`,
      firm.firm_type ? `TYPE: ${firm.firm_type}` : null,
      firm.aum_usd ? `AUM: $${(Number(firm.aum_usd) / 1e9).toFixed(1)}B` : null,
      firm.description
        ? `DESCRIPTION: ${firm.description.slice(0, 400)}`
        : null,
      '',
      `AI SCORE: ${context.score}`,
      '',
      'AI SIGNALS:',
      context.signalSummaries || 'No signals collected yet.',
    ];

    if (context.dataSources) {
      parts.push('', 'RELEVANT SOURCES (excerpts):', context.dataSources);
    }

    parts.push(
      '',
      `Write a personalized outreach message from Soal Labs to ${person.full_name}.`,
    );

    return parts.filter((p) => p !== null).join('\n');
  }

  private async callLlm(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string | null> {
    const provider = this.config.get<string>('llm.provider') || 'anthropic';

    if (provider === 'openai') {
      return this.openaiService.generateCompletion(systemPrompt, userPrompt);
    }
    return this.anthropicService.generateCompletion(systemPrompt, userPrompt);
  }
}
