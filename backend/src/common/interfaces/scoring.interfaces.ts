export interface DimensionWeight {
  ai_talent_density: number;
  public_ai_activity: number;
  ai_hiring_velocity: number;
  thought_leadership: number;
  vendor_partnerships: number;
  portfolio_ai_strategy: number;
}

export interface ScoringThresholds {
  min_signals_for_score: number;
  high_confidence_threshold: number;
}

export interface ScoringConfig {
  version: string;
  weights: DimensionWeight;
  thresholds: ScoringThresholds;
}

export const DIMENSION_SCORE_KEYS = [
  'ai_talent_density',
  'public_ai_activity',
  'ai_hiring_velocity',
  'thought_leadership',
  'vendor_partnerships',
  'portfolio_ai_strategy',
] as const;

export type DimensionScoreKey = (typeof DIMENSION_SCORE_KEYS)[number];

export interface DimensionScore {
  dimension: string;
  rawScore: number;
  weightedScore: number;
  signalCount: number;
  maxPossible: number;
}

export interface DimensionScoreJson {
  dimension: string;
  raw_score: number;
  weighted_score: number;
  signal_count: number;
  max_possible: number;
}

export type DimensionScoresJson = Partial<
  Record<DimensionScoreKey, DimensionScoreJson>
>;

export function toDimensionScoreJson(d: DimensionScore): DimensionScoreJson {
  return {
    dimension: d.dimension,
    raw_score: d.rawScore,
    weighted_score: d.weightedScore,
    signal_count: d.signalCount,
    max_possible: d.maxPossible,
  };
}

export type ScoringWeightsJson = Record<DimensionScoreKey, number>;

export type ScoringThresholdsJson = ScoringThresholds;

export interface ScoringParametersJson {
  weights: ScoringWeightsJson;
  thresholds: ScoringThresholdsJson;
}

export function toScoringParametersJson(
  config: ScoringConfig,
): ScoringParametersJson {
  return {
    weights: { ...config.weights },
    thresholds: { ...config.thresholds },
  };
}

export interface ScoringResult {
  overallScore: number;
  dimensions: DimensionScore[];
  signalCount: number;
  evidence: EvidenceEntry[];
}

export interface EvidenceEntry {
  signalId: string;
  dimension: DimensionScoreKey;
  weightApplied: number;
  pointsContributed: number;
  reasoning: string;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: 'v1.0',
  weights: {
    ai_talent_density: 0.25,
    public_ai_activity: 0.2,
    ai_hiring_velocity: 0.2,
    thought_leadership: 0.15,
    vendor_partnerships: 0.1,
    portfolio_ai_strategy: 0.1,
  },
  thresholds: {
    min_signals_for_score: 1,
    high_confidence_threshold: 0.7,
  },
};
