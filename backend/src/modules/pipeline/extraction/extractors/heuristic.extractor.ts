import { Injectable } from '@nestjs/common';
import {
  SignalType,
  ExtractionMethod,
} from '../../../../common/enums/index.js';
import {
  ExtractionResult,
  ExtractorInput,
  Extractor,
  SignalDataJson,
} from '../../../../common/interfaces/index.js';

interface HeuristicRule {
  keywords: string[];
  requireAll?: boolean;
  signalType: SignalType;
  confidenceBoost: number;
  dataFields: (
    input: ExtractorInput,
    matchedKeywords: string[],
  ) => SignalDataJson;
}

@Injectable()
export class HeuristicExtractor implements Extractor {
  readonly name = 'heuristic';

  private readonly rules: HeuristicRule[] = [
    {
      keywords: ['chief data officer', 'CDO', 'head of data'],
      signalType: SignalType.AI_TEAM_GROWTH,
      confidenceBoost: 0.15,
      dataFields: (input, matched) => ({
        role: 'data_leadership',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
    {
      keywords: ['chief technology officer', 'CTO', 'head of technology'],
      signalType: SignalType.AI_TEAM_GROWTH,
      confidenceBoost: 0.1,
      dataFields: (input, matched) => ({
        role: 'tech_leadership',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
    {
      keywords: ['operating partner', 'technology', 'digital'],
      requireAll: true,
      signalType: SignalType.AI_TEAM_GROWTH,
      confidenceBoost: 0.2,
      dataFields: (input, matched) => ({
        role: 'operating_partner_tech',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
    {
      keywords: [
        'data scientist',
        'machine learning engineer',
        'AI engineer',
        'ML engineer',
      ],
      signalType: SignalType.AI_HIRING,
      confidenceBoost: 0.1,
      dataFields: (input, matched) => ({
        job_role: matched[0],
        firm_name: input.firmName,
        context: 'technical_hire',
      }),
    },
    {
      keywords: ['portfolio', 'AI', 'value creation'],
      requireAll: true,
      signalType: SignalType.PORTFOLIO_AI_INITIATIVE,
      confidenceBoost: 0.2,
      dataFields: (input, matched) => ({
        description: 'Portfolio AI value creation initiative',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
    {
      keywords: ['Holland', 'Mountain', 'PE stack', 'tech stack'],
      signalType: SignalType.TECH_STACK_SIGNAL,
      confidenceBoost: 0.15,
      dataFields: (input, matched) => ({
        source: 'holland_mountain',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
    {
      keywords: ['case study', 'AI', 'implementation'],
      requireAll: true,
      signalType: SignalType.AI_CASE_STUDY,
      confidenceBoost: 0.15,
      dataFields: (input, matched) => ({
        description: 'AI implementation case study',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
    {
      keywords: ['research', 'whitepaper', 'AI', 'published'],
      requireAll: false,
      signalType: SignalType.AI_RESEARCH,
      confidenceBoost: 0.1,
      dataFields: (input, matched) => ({
        type: 'research_publication',
        matched_terms: matched,
        firm_name: input.firmName,
      }),
    },
  ];

  extract(input: ExtractorInput): ExtractionResult[] {
    const results: ExtractionResult[] = [];
    const lowerContent = input.content.toLowerCase();

    for (const rule of this.rules) {
      const matchedKeywords: string[] = [];

      for (const keyword of rule.keywords) {
        if (lowerContent.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
        }
      }

      const isMatch = rule.requireAll
        ? matchedKeywords.length === rule.keywords.length
        : matchedKeywords.length > 0;

      if (isMatch) {
        const confidence = Math.min(
          0.5 + rule.confidenceBoost + matchedKeywords.length * 0.05,
          0.85,
        );

        results.push({
          signalType: rule.signalType,
          data: rule.dataFields(input, matchedKeywords),
          confidence,
          method: ExtractionMethod.HEURISTIC,
        });
      }
    }

    return results;
  }
}
