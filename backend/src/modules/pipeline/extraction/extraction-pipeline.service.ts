import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirmSignal } from '../../../database/entities/firm-signal.entity.js';
import {
  ExtractionResult,
  ExtractorInput,
  CONFIDENCE_THRESHOLD,
} from '../../../common/interfaces/index.js';
import { RegexExtractor } from './extractors/regex.extractor.js';
import { NlpExtractor } from './extractors/nlp.extractor.js';
import { HeuristicExtractor } from './extractors/heuristic.extractor.js';
import { LlmExtractor } from './extractors/llm.extractor.js';
import { CommonLogger } from '../../../common/utils/index.js';

@Injectable()
export class ExtractionPipelineService {
  private readonly logger = new CommonLogger(ExtractionPipelineService.name);
  private readonly confidenceThreshold: number;

  constructor(
    @InjectRepository(FirmSignal)
    private readonly signalRepo: Repository<FirmSignal>,
    private readonly regexExtractor: RegexExtractor,
    private readonly nlpExtractor: NlpExtractor,
    private readonly heuristicExtractor: HeuristicExtractor,
    private readonly llmExtractor: LlmExtractor,
    private readonly config: ConfigService,
  ) {
    this.confidenceThreshold =
      this.config.get<number>('app.extractionConfidenceThreshold') ??
      CONFIDENCE_THRESHOLD;
  }

  async process(
    input: ExtractorInput,
    firmId: string,
    dataSourceId: string,
  ): Promise<FirmSignal[]> {
    const allResults: ExtractionResult[] = [];

    const regexResults = this.regexExtractor.extract(input);
    allResults.push(...regexResults);

    const highConfRegex = regexResults.filter(
      (r) => r.confidence >= this.confidenceThreshold,
    );

    if (
      highConfRegex.length < regexResults.length ||
      regexResults.length === 0
    ) {
      const nlpResults = this.nlpExtractor.extract(input);
      allResults.push(...nlpResults);

      const highConfNlp = nlpResults.filter(
        (r) => r.confidence >= this.confidenceThreshold,
      );

      if (highConfNlp.length < nlpResults.length || nlpResults.length === 0) {
        const heuristicResults = this.heuristicExtractor.extract(input);
        allResults.push(...heuristicResults);

        const allHighConf = allResults.filter(
          (r) => r.confidence >= this.confidenceThreshold,
        );

        if (allHighConf.length === 0) {
          this.logger.debug(
            `Low confidence across all extractors for ${input.firmName}; invoking LLM fallback`,
          );

          const llmResults = await this.llmExtractor.extract(input);
          allResults.push(...llmResults);
        }
      }
    }

    const deduped = this.deduplicateResults(allResults);

    const savedSignals: FirmSignal[] = [];
    for (const result of deduped) {
      const signal = this.signalRepo.create({
        firm_id: firmId,
        signal_type: result.signalType,
        signal_data: result.data,
        data_source_id: dataSourceId,
        extraction_method: result.method,
        extraction_confidence: result.confidence,
      });
      await this.signalRepo.save(signal);
      savedSignals.push(signal);
    }

    this.logger.debug(
      `Extracted ${savedSignals.length} signals for firm ${input.firmName}`,
    );

    return savedSignals;
  }

  private deduplicateResults(results: ExtractionResult[]): ExtractionResult[] {
    const seen = new Map<string, ExtractionResult>();

    for (const result of results) {
      const key = `${result.signalType}:${JSON.stringify(result.data).slice(0, 200)}`;
      const existing = seen.get(key);

      if (!existing || result.confidence > existing.confidence) {
        seen.set(key, result);
      }
    }

    return Array.from(seen.values());
  }
}
