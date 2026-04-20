export type {
  DimensionWeight,
  ScoringThresholds,
  ScoringConfig,
  DimensionScoreKey,
  DimensionScore,
  DimensionScoreJson,
  DimensionScoresJson,
  ScoringWeightsJson,
  ScoringThresholdsJson,
  ScoringParametersJson,
  ScoringResult,
  EvidenceEntry,
} from './scoring.interfaces.js';
export {
  DIMENSION_SCORE_KEYS,
  toDimensionScoreJson,
  toScoringParametersJson,
} from './scoring.interfaces.js';
export { DEFAULT_SCORING_CONFIG } from './scoring.interfaces.js';
export type {
  SignalDataJson,
  ExtractionResult,
  ExtractorInput,
  Extractor,
} from './extraction.interfaces.js';
export { CONFIDENCE_THRESHOLD } from './extraction.interfaces.js';
export type {
  DataSourceMetadataJson,
  ScrapeJobMetadataJson,
} from './entity-metadata.interfaces.js';
