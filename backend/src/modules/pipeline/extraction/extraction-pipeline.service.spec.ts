import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ExtractionPipelineService } from './extraction-pipeline.service';
import { RegexExtractor } from './extractors/regex.extractor';
import { NlpExtractor } from './extractors/nlp.extractor';
import { HeuristicExtractor } from './extractors/heuristic.extractor';
import { LlmExtractor } from './extractors/llm.extractor';
import { FirmSignal } from '../../../database/entities/firm-signal.entity';
import { SignalType, ExtractionMethod } from '../../../common/enums';
import {
  ExtractionResult,
  ExtractorInput,
  CONFIDENCE_THRESHOLD,
} from '../../../common/interfaces';

describe('ExtractionPipelineService', () => {
  let service: ExtractionPipelineService;
  let signalRepo: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let regexExtractor: { extract: jest.Mock; name: string };
  let nlpExtractor: { extract: jest.Mock; name: string };
  let heuristicExtractor: { extract: jest.Mock; name: string };
  let llmExtractor: { extract: jest.Mock; name: string };
  let configService: { get: jest.Mock };

  const baseInput: ExtractorInput = {
    content: 'Test content about AI in private equity.',
    url: 'https://example.com/article',
    sourceType: 'web',
    firmName: 'Acme Capital',
  };

  const firmId = 'firm-uuid-123';
  const dataSourceId = 'ds-uuid-456';

  const makeResult = (
    overrides: Partial<ExtractionResult> = {},
  ): ExtractionResult => ({
    signalType: SignalType.AI_HIRING,
    data: { firm_name: 'Acme Capital' },
    confidence: 0.5,
    method: ExtractionMethod.REGEX,
    ...overrides,
  });

  const highConfResult = (
    overrides: Partial<ExtractionResult> = {},
  ): ExtractionResult =>
    makeResult({ confidence: CONFIDENCE_THRESHOLD + 0.1, ...overrides });

  const lowConfResult = (
    overrides: Partial<ExtractionResult> = {},
  ): ExtractionResult =>
    makeResult({ confidence: CONFIDENCE_THRESHOLD - 0.1, ...overrides });

  beforeEach(async () => {
    signalRepo = {
      create: jest.fn((data) => ({ id: 'signal-id', ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    regexExtractor = { extract: jest.fn().mockReturnValue([]), name: 'regex' };
    nlpExtractor = { extract: jest.fn().mockReturnValue([]), name: 'nlp' };
    heuristicExtractor = {
      extract: jest.fn().mockReturnValue([]),
      name: 'heuristic',
    };
    llmExtractor = { extract: jest.fn().mockResolvedValue([]), name: 'llm' };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        ExtractionPipelineService,
        { provide: getRepositoryToken(FirmSignal), useValue: signalRepo },
        { provide: RegexExtractor, useValue: regexExtractor },
        { provide: NlpExtractor, useValue: nlpExtractor },
        { provide: HeuristicExtractor, useValue: heuristicExtractor },
        { provide: LlmExtractor, useValue: llmExtractor },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(ExtractionPipelineService);
  });

  describe('Extraction cascade logic', () => {
    it('should skip NLP/heuristic/LLM when all regex results are high confidence', async () => {
      const r1 = highConfResult({ signalType: SignalType.AI_HIRING });
      const r2 = highConfResult({
        signalType: SignalType.AI_VENDOR_PARTNERSHIP,
      });
      regexExtractor.extract.mockReturnValue([r1, r2]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(regexExtractor.extract).toHaveBeenCalledWith(baseInput);
      expect(nlpExtractor.extract).not.toHaveBeenCalled();
      expect(heuristicExtractor.extract).not.toHaveBeenCalled();
      expect(llmExtractor.extract).not.toHaveBeenCalled();
    });

    it('should run NLP when some regex results have low confidence', async () => {
      regexExtractor.extract.mockReturnValue([
        highConfResult(),
        lowConfResult(),
      ]);
      const nlpResult = highConfResult({
        method: ExtractionMethod.NLP,
        signalType: SignalType.AI_TEAM_GROWTH,
      });
      nlpExtractor.extract.mockReturnValue([nlpResult]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(nlpExtractor.extract).toHaveBeenCalledWith(baseInput);
    });

    it('should run NLP when regex returns empty results', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([
        highConfResult({ method: ExtractionMethod.NLP }),
      ]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(nlpExtractor.extract).toHaveBeenCalledWith(baseInput);
    });

    it('should skip heuristic when all NLP results are high confidence', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([
        highConfResult({ method: ExtractionMethod.NLP }),
        highConfResult({
          method: ExtractionMethod.NLP,
          signalType: SignalType.AI_NEWS_MENTION,
        }),
      ]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(heuristicExtractor.extract).not.toHaveBeenCalled();
      expect(llmExtractor.extract).not.toHaveBeenCalled();
    });

    it('should run heuristic when some NLP results are low confidence', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([
        lowConfResult({ method: ExtractionMethod.NLP }),
      ]);
      heuristicExtractor.extract.mockReturnValue([
        highConfResult({ method: ExtractionMethod.HEURISTIC }),
      ]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(heuristicExtractor.extract).toHaveBeenCalledWith(baseInput);
    });

    it('should run heuristic when NLP returns empty results', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([]);
      heuristicExtractor.extract.mockReturnValue([]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(heuristicExtractor.extract).toHaveBeenCalledWith(baseInput);
    });

    it('should skip LLM when heuristic produces some high confidence results', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([]);
      heuristicExtractor.extract.mockReturnValue([
        highConfResult({ method: ExtractionMethod.HEURISTIC }),
      ]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(llmExtractor.extract).not.toHaveBeenCalled();
    });

    it('should run LLM fallback when no high confidence results from any extractor', async () => {
      regexExtractor.extract.mockReturnValue([lowConfResult()]);
      nlpExtractor.extract.mockReturnValue([
        lowConfResult({ method: ExtractionMethod.NLP }),
      ]);
      heuristicExtractor.extract.mockReturnValue([
        lowConfResult({ method: ExtractionMethod.HEURISTIC }),
      ]);
      llmExtractor.extract.mockResolvedValue([
        highConfResult({ method: ExtractionMethod.LLM }),
      ]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(llmExtractor.extract).toHaveBeenCalledWith(baseInput);
    });

    it('should run LLM fallback when all extractors return empty', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([]);
      heuristicExtractor.extract.mockReturnValue([]);
      llmExtractor.extract.mockResolvedValue([]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(llmExtractor.extract).toHaveBeenCalledWith(baseInput);
    });
  });

  describe('Deduplication', () => {
    it('should keep the result with highest confidence for duplicate keys', async () => {
      const lowConf = makeResult({
        signalType: SignalType.AI_HIRING,
        data: { firm_name: 'Acme Capital', role: 'CTO' },
        confidence: 0.5,
        method: ExtractionMethod.REGEX,
      });
      const highConf = makeResult({
        signalType: SignalType.AI_HIRING,
        data: { firm_name: 'Acme Capital', role: 'CTO' },
        confidence: 0.9,
        method: ExtractionMethod.HEURISTIC,
      });

      regexExtractor.extract.mockReturnValue([lowConf]);
      nlpExtractor.extract.mockReturnValue([]);
      heuristicExtractor.extract.mockReturnValue([highConf]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(signalRepo.create).toHaveBeenCalledTimes(1);
      expect(signalRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extraction_confidence: 0.9,
        }),
      );
    });

    it('should keep both results when signal types differ', async () => {
      const r1 = highConfResult({ signalType: SignalType.AI_HIRING });
      const r2 = highConfResult({
        signalType: SignalType.AI_VENDOR_PARTNERSHIP,
      });
      regexExtractor.extract.mockReturnValue([r1, r2]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(signalRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should keep both results when data JSON differs', async () => {
      const r1 = highConfResult({
        signalType: SignalType.AI_HIRING,
        data: { firm_name: 'Acme', role: 'CTO' },
      });
      const r2 = highConfResult({
        signalType: SignalType.AI_HIRING,
        data: { firm_name: 'Acme', role: 'data_scientist' },
      });
      regexExtractor.extract.mockReturnValue([r1, r2]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(signalRepo.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Signal persistence', () => {
    it('should save each deduplicated result to the repository', async () => {
      regexExtractor.extract.mockReturnValue([
        highConfResult({ signalType: SignalType.AI_HIRING }),
        highConfResult({ signalType: SignalType.AI_CASE_STUDY }),
      ]);

      const savedSignals = await service.process(
        baseInput,
        firmId,
        dataSourceId,
      );

      expect(signalRepo.create).toHaveBeenCalledTimes(2);
      expect(signalRepo.save).toHaveBeenCalledTimes(2);
      expect(savedSignals).toHaveLength(2);
    });

    it('should pass correct fields to signalRepo.create', async () => {
      const result = highConfResult({
        signalType: SignalType.AI_VENDOR_PARTNERSHIP,
        data: { vendor: 'Snowflake', firm_name: 'Acme Capital' },
        confidence: 0.85,
        method: ExtractionMethod.REGEX,
      });
      regexExtractor.extract.mockReturnValue([result]);

      await service.process(baseInput, firmId, dataSourceId);

      expect(signalRepo.create).toHaveBeenCalledWith({
        firm_id: firmId,
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: result.data,
        data_source_id: dataSourceId,
        extraction_method: ExtractionMethod.REGEX,
        extraction_confidence: 0.85,
      });
    });

    it('should return empty array when no signals are found', async () => {
      regexExtractor.extract.mockReturnValue([]);
      nlpExtractor.extract.mockReturnValue([]);
      heuristicExtractor.extract.mockReturnValue([]);
      llmExtractor.extract.mockResolvedValue([]);

      const result = await service.process(baseInput, firmId, dataSourceId);

      expect(result).toEqual([]);
      expect(signalRepo.create).not.toHaveBeenCalled();
      expect(signalRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Full pipeline integration scenarios', () => {
    it('should accumulate results from regex + NLP when regex has mixed confidence', async () => {
      regexExtractor.extract.mockReturnValue([
        highConfResult({ signalType: SignalType.AI_HIRING }),
        lowConfResult({ signalType: SignalType.AI_CASE_STUDY }),
      ]);
      nlpExtractor.extract.mockReturnValue([
        highConfResult({
          signalType: SignalType.AI_NEWS_MENTION,
          method: ExtractionMethod.NLP,
        }),
      ]);

      const result = await service.process(baseInput, firmId, dataSourceId);

      expect(result).toHaveLength(3);
      expect(heuristicExtractor.extract).not.toHaveBeenCalled();
    });

    it('should accumulate results from regex + NLP + heuristic when NLP has mixed confidence', async () => {
      regexExtractor.extract.mockReturnValue([
        lowConfResult({
          signalType: SignalType.AI_HIRING,
          data: { firm_name: 'Acme Capital', role: 'analyst' },
        }),
      ]);
      nlpExtractor.extract.mockReturnValue([
        lowConfResult({
          method: ExtractionMethod.NLP,
          signalType: SignalType.AI_NEWS_MENTION,
          data: { firm_name: 'Acme Capital', mention: 'nlp' },
        }),
      ]);
      heuristicExtractor.extract.mockReturnValue([
        highConfResult({
          signalType: SignalType.TECH_STACK_SIGNAL,
          method: ExtractionMethod.HEURISTIC,
          data: { firm_name: 'Acme Capital', stack: 'snowflake' },
        }),
      ]);

      const result = await service.process(baseInput, firmId, dataSourceId);

      expect(result).toHaveLength(3);
      expect(llmExtractor.extract).not.toHaveBeenCalled();
    });
  });
});
