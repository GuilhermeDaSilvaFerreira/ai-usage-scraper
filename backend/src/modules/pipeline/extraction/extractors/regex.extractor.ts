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

interface PatternRule {
  pattern: RegExp;
  signalType: SignalType;
  dataExtractor: (
    match: RegExpMatchArray,
    input: ExtractorInput,
  ) => SignalDataJson;
  baseConfidence: number;
}

@Injectable()
export class RegexExtractor implements Extractor {
  readonly name = 'regex';

  private readonly rules: PatternRule[] = [
    {
      pattern:
        /(?:hired|appointed|named|promoted)\s+(\w[\w\s]{2,40})\s+(?:as\s+)?(?:chief\s+(?:data|technology|AI|analytics|digital)\s+officer|head\s+of\s+(?:data|AI|technology|analytics|engineering)|VP\s+(?:of\s+)?(?:data|AI|technology|engineering))/gi,
      signalType: SignalType.AI_HIRING,
      dataExtractor: (match, input) => ({
        person_name: match[1]?.trim(),
        title: match[0],
        firm_name: input.firmName,
        context: 'executive_hire',
      }),
      baseConfidence: 0.9,
    },
    {
      pattern:
        /(?:partner(?:ed|ship|ing)\s+with|selected|deployed|implemented|adopted|using|leveraging)\s+((?:DataRobot|Databricks|Snowflake|Palantir|Scale AI|C3\.ai|H2O\.ai|AWS|Azure|Google Cloud|Dataiku|Alteryx|SAS|Tableau|Power BI|OpenAI|Anthropic|Cohere|MongoDB|Elastic))/gi,
      signalType: SignalType.AI_VENDOR_PARTNERSHIP,
      dataExtractor: (match, input) => ({
        vendor_name: match[1]?.trim(),
        context: match[0],
        firm_name: input.firmName,
      }),
      baseConfidence: 0.85,
    },
    {
      pattern:
        /\$?\s*([\d,.]+)\s*(?:billion|B|bn)\s+(?:in\s+)?(?:assets?\s+under\s+management|AUM)/gi,
      signalType: SignalType.TECH_STACK_SIGNAL,
      dataExtractor: (match, input) => ({
        aum_mention: match[1],
        context: match[0],
        firm_name: input.firmName,
        type: 'aum_reference',
      }),
      baseConfidence: 0.9,
    },
    {
      pattern:
        /(?:launch(?:ed|ing)|built|develop(?:ed|ing)|creat(?:ed|ing)|deploy(?:ed|ing))\s+(?:an?\s+)?(?:AI|artificial intelligence|machine learning|ML|data analytics|predictive)\s+(?:platform|tool|system|solution|model|algorithm|pipeline|dashboard)/gi,
      signalType: SignalType.AI_CASE_STUDY,
      dataExtractor: (match, input) => ({
        description: match[0],
        firm_name: input.firmName,
        context: 'ai_initiative',
      }),
      baseConfidence: 0.8,
    },
    {
      pattern:
        /(?:hiring|looking\s+for|job\s+(?:opening|posting))\s*:?\s*(?:senior\s+)?(?:data\s+scientist|machine\s+learning\s+engineer|AI\s+engineer|data\s+engineer|analytics\s+engineer|ML\s+ops|NLP\s+engineer)/gi,
      signalType: SignalType.AI_HIRING,
      dataExtractor: (match, input) => ({
        job_title: match[0],
        firm_name: input.firmName,
        context: 'job_posting',
      }),
      baseConfidence: 0.85,
    },
    {
      pattern:
        /(?:spoke|speaking|presented|keynote|panelist|panel\s+discussion)\s+(?:at|during)\s+([\w\s]+(?:conference|summit|forum|symposium|congress))/gi,
      signalType: SignalType.AI_CONFERENCE_TALK,
      dataExtractor: (match, input) => ({
        event: match[1]?.trim(),
        context: match[0],
        firm_name: input.firmName,
      }),
      baseConfidence: 0.85,
    },
    {
      pattern:
        /(?:across|throughout)\s+(?:our|the|its)\s+portfolio\s+(?:companies?)?\s*(?:,?\s*)?(?:implement(?:ed|ing)|deploy(?:ed|ing)|leverag(?:ed|ing)|adopt(?:ed|ing)|using)\s+(?:AI|artificial intelligence|machine learning|data analytics)/gi,
      signalType: SignalType.PORTFOLIO_AI_INITIATIVE,
      dataExtractor: (match, input) => ({
        description: match[0],
        firm_name: input.firmName,
        context: 'portfolio_ai_strategy',
      }),
      baseConfidence: 0.85,
    },
  ];

  extract(input: ExtractorInput): ExtractionResult[] {
    const results: ExtractionResult[] = [];

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(input.content)) !== null) {
        results.push({
          signalType: rule.signalType,
          data: rule.dataExtractor(match, input),
          confidence: rule.baseConfidence,
          method: ExtractionMethod.REGEX,
        });
      }
    }

    return results;
  }
}
