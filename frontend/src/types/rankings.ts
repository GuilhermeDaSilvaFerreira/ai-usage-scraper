import type { FirmType } from './common'

export type RankingRow = {
  rank: number
  firm_id: string
  firm_name: string | undefined
  firm_type: FirmType | null
  aum_usd: number | null | undefined
  overall_score: number
  dimension_scores: Record<string, unknown> | null
  signal_count: number
  score_version: string
  scored_at: string
}

export type RankingsResponse = {
  items: RankingRow[]
  total: number
  page: number
  limit: number
  total_pages: number
  score_version: string
}
