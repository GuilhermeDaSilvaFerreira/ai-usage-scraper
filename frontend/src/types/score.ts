import type { DataSource, FirmSignal } from './signal'

export type DimensionScoreKey =
  | 'ai_talent_density'
  | 'public_ai_activity'
  | 'ai_hiring_velocity'
  | 'thought_leadership'
  | 'vendor_partnerships'
  | 'portfolio_ai_strategy'

export type DimensionScoreJson = {
  dimension: string
  raw_score: number
  weighted_score: number
  signal_count: number
  max_possible: number
}

export type DimensionScoresJson = Partial<
  Record<DimensionScoreKey, DimensionScoreJson>
>

export type ScoringWeightsJson = Partial<Record<DimensionScoreKey, number>>

export type ScoringThresholdsJson = {
  min_signals_for_score: number
  high_confidence_threshold: number
}

export type ScoringParametersJson = {
  weights: ScoringWeightsJson
  thresholds: ScoringThresholdsJson
}

export type FirmScore = {
  id: string
  firm_id: string
  score_version: string
  overall_score: number
  dimension_scores: DimensionScoresJson | null
  rank: number | null
  scoring_parameters: ScoringParametersJson | null
  signal_count: number
  scored_at: string
  created_at: string
  evidence?: ScoreEvidence[]
}

export type ScoreEvidence = {
  id: string
  firm_score_id: string
  firm_signal_id: string
  dimension: string
  weight_applied: number
  points_contributed: number
  reasoning: string | null
  signal?: FirmSignal & { data_source?: DataSource | null }
}
