import { Injectable } from '@nestjs/common';
import nlp from 'compromise';
import {
  SignalType,
  ExtractionMethod,
} from '../../../../common/enums/index.js';
import {
  ExtractionResult,
  ExtractorInput,
  Extractor,
} from '../../../../common/interfaces/index.js';

const AI_KEYWORDS = new Set([
  'artificial intelligence',
  'machine learning',
  'deep learning',
  'neural network',
  'natural language processing',
  'nlp',
  'computer vision',
  'data science',
  'generative ai',
  'gen ai',
  'large language model',
  'llm',
  'chatgpt',
  'gpt',
  'predictive analytics',
  'automation',
  'robotic process automation',
  'rpa',
  'data analytics',
  'big data',
  'ml ops',
  'mlops',
]);

const TECH_TITLE_KEYWORDS = new Set([
  'chief data officer',
  'chief technology officer',
  'cto',
  'cdo',
  'chief information officer',
  'cio',
  'chief digital officer',
  'chief analytics officer',
  'head of data',
  'head of technology',
  'head of ai',
  'head of engineering',
  'vp of data',
  'vp of technology',
  'vp of engineering',
  'data science lead',
  'director of data',
  'director of technology',
  'director of ai',
  'managing director technology',
  'operating partner technology',
]);

@Injectable()
export class NlpExtractor implements Extractor {
  readonly name = 'nlp';

  extract(input: ExtractorInput): ExtractionResult[] {
    const results: ExtractionResult[] = [];
    const doc = nlp(input.content);
    const lowerContent = input.content.toLowerCase();

    const aiMentionCount = this.countAiKeywords(lowerContent);

    if (aiMentionCount > 0) {
      const sentences = doc.sentences().json() as { text: string }[];
      for (const sentence of sentences) {
        const sentenceText = (sentence.text || '').toLowerCase();
        const hasAiKeyword = [...AI_KEYWORDS].some((kw) =>
          sentenceText.includes(kw),
        );
        if (!hasAiKeyword) continue;

        const people = nlp(sentence.text).people().json() as { text: string }[];
        for (const person of people) {
          const personName = person.text?.trim();
          if (!personName || personName.length < 3) continue;

          const surroundingText = this.getSurroundingText(
            input.content,
            personName,
          );
          const hasTechTitle = [...TECH_TITLE_KEYWORDS].some((t) =>
            surroundingText.toLowerCase().includes(t),
          );

          if (hasTechTitle) {
            results.push({
              signalType: SignalType.AI_TEAM_GROWTH,
              data: {
                person_name: personName,
                context: surroundingText.slice(0, 300),
                firm_name: input.firmName,
                type: 'person_with_tech_title',
              },
              confidence: 0.65,
              method: ExtractionMethod.NLP,
            });
          }
        }

        if (
          sentenceText.includes(input.firmName.toLowerCase()) ||
          sentenceText.includes(input.firmName.split(' ')[0].toLowerCase())
        ) {
          const signalType = this.classifySentence(sentenceText);
          if (signalType) {
            results.push({
              signalType,
              data: {
                sentence: sentence.text,
                firm_name: input.firmName,
                ai_keyword_density: aiMentionCount,
              },
              confidence: 0.6,
              method: ExtractionMethod.NLP,
            });
          }
        }
      }
    }

    if (aiMentionCount >= 3) {
      results.push({
        signalType: SignalType.AI_NEWS_MENTION,
        data: {
          ai_keyword_count: aiMentionCount,
          firm_name: input.firmName,
          url: input.url,
          type: 'high_ai_keyword_density',
        },
        confidence: Math.min(0.5 + aiMentionCount * 0.05, 0.8),
        method: ExtractionMethod.NLP,
      });
    }

    return results;
  }

  private countAiKeywords(text: string): number {
    let count = 0;
    for (const keyword of AI_KEYWORDS) {
      const regex = new RegExp(
        keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'gi',
      );
      const matches = text.match(regex);
      if (matches) count += matches.length;
    }
    return count;
  }

  private getSurroundingText(content: string, target: string): string {
    const idx = content.indexOf(target);
    if (idx === -1) return '';
    const start = Math.max(0, idx - 200);
    const end = Math.min(content.length, idx + target.length + 200);
    return content.slice(start, end);
  }

  private classifySentence(sentence: string): SignalType | null {
    if (
      sentence.includes('hire') ||
      sentence.includes('appoint') ||
      sentence.includes('recruit')
    )
      return SignalType.AI_HIRING;
    if (sentence.includes('partner') || sentence.includes('vendor'))
      return SignalType.AI_VENDOR_PARTNERSHIP;
    if (
      sentence.includes('conference') ||
      sentence.includes('summit') ||
      sentence.includes('keynote')
    )
      return SignalType.AI_CONFERENCE_TALK;
    if (sentence.includes('podcast') || sentence.includes('episode'))
      return SignalType.AI_PODCAST;
    if (
      sentence.includes('launch') ||
      sentence.includes('deploy') ||
      sentence.includes('implement')
    )
      return SignalType.AI_CASE_STUDY;
    if (sentence.includes('portfolio'))
      return SignalType.PORTFOLIO_AI_INITIATIVE;
    return SignalType.AI_NEWS_MENTION;
  }
}
