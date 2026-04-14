import { ExtractionMethod } from '../enums/index.js';
import { SignalType } from '../enums/index.js';

export interface SignalDataJson {
  firm_name?: string;
  person_name?: string;
  title?: string;
  role?: string;
  job_title?: string;
  job_role?: string;
  vendor_name?: string;
  aum_mention?: string;
  source?: string;
  description?: string;
  event?: string;
  context?: string;
  type?: string;
  matched_terms?: string[];
  sentence?: string;
  ai_keyword_density?: number;
  ai_keyword_count?: number;
  url?: string;
  llm_reasoning?: string;
  [key: string]: unknown;
}

export interface ExtractionResult {
  signalType: SignalType;
  data: SignalDataJson;
  confidence: number;
  method: ExtractionMethod;
}

export interface ExtractorInput {
  content: string;
  url: string;
  sourceType: string;
  firmName: string;
  metadata?: Record<string, unknown>;
}

export interface Extractor {
  extract(
    input: ExtractorInput,
  ): ExtractionResult[] | Promise<ExtractionResult[]>;
  readonly name: string;
}

export const CONFIDENCE_THRESHOLD = 0.7;
