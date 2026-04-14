export interface DimensionWeight {
  aiTalentDensity: number;
  publicAIActivity: number;
  aiHiringVelocity: number;
  thoughtLeadership: number;
  vendorPartnerships: number;
  portfolioAIStrategy: number;
}

export interface ScoringConfig {
  version: string;
  weights: DimensionWeight;
  thresholds: {
    minSignalsForScore: number;
    highConfidenceThreshold: number;
  };
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

export interface ScoringThresholdsJson {
  min_signals_for_score: number;
  high_confidence_threshold: number;
}

export interface ScoringParametersJson {
  weights: ScoringWeightsJson;
  thresholds: ScoringThresholdsJson;
}

export function toScoringParametersJson(
  config: ScoringConfig,
): ScoringParametersJson {
  return {
    weights: {
      ai_talent_density: config.weights.aiTalentDensity,
      public_ai_activity: config.weights.publicAIActivity,
      ai_hiring_velocity: config.weights.aiHiringVelocity,
      thought_leadership: config.weights.thoughtLeadership,
      vendor_partnerships: config.weights.vendorPartnerships,
      portfolio_ai_strategy: config.weights.portfolioAIStrategy,
    },
    thresholds: {
      min_signals_for_score: config.thresholds.minSignalsForScore,
      high_confidence_threshold: config.thresholds.highConfidenceThreshold,
    },
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
    aiTalentDensity: 0.25,
    publicAIActivity: 0.2,
    aiHiringVelocity: 0.2,
    thoughtLeadership: 0.15,
    vendorPartnerships: 0.1,
    portfolioAIStrategy: 0.1,
  },
  thresholds: {
    minSignalsForScore: 1,
    highConfidenceThreshold: 0.7,
  },
};
