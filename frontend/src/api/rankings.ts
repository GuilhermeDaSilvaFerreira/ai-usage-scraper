import type { FirmType } from '@/types/common'
import type { RankingsResponse } from '@/types/rankings'
import { api } from './client'

export type RankingsQuery = {
  score_version?: string
  firm_type?: FirmType
  page?: number
  limit?: number
}

export async function getRankings(params?: RankingsQuery, signal?: AbortSignal) {
  const { data } = await api.get<RankingsResponse>('/rankings', { params, signal })
  return data
}

export type DimensionTopFirm = {
  firm_id: string
  firm_name: string | undefined
  dimension_score: number
  overall_score: number
}

export type DimensionBreakdownRow = {
  dimension: string
  top_firms: DimensionTopFirm[]
}

export async function getDimensionBreakdown(
  scoreVersion?: string,
  signal?: AbortSignal,
) {
  const { data } = await api.get<DimensionBreakdownRow[]>('/rankings/dimensions', {
    params: scoreVersion ? { score_version: scoreVersion } : undefined,
    signal,
  })
  return data
}
