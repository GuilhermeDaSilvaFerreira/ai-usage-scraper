import type { FirmType, Paginated } from '@/types/common'
import type { Firm, FirmDetail } from '@/types/firm'
import type { FirmScore } from '@/types/score'
import type { FirmSignal } from '@/types/signal'
import { api } from './client'

export type QueryFirmsParams = {
  search?: string
  firm_type?: FirmType
  min_aum?: number
  page?: number
  limit?: number
  sort_by?: 'name' | 'aum_usd' | 'created_at'
  sort_order?: 'ASC' | 'DESC'
}

export async function getFirms(params?: QueryFirmsParams, signal?: AbortSignal) {
  const { data } = await api.get<Paginated<Firm>>('/firms', {
    params,
    signal,
  })
  return data
}

export async function getFirmById(id: string, signal?: AbortSignal) {
  const { data } = await api.get<FirmDetail>(`/firms/${id}`, { signal })
  return data
}

export type FirmSignalsParams = {
  page?: number
  limit?: number
}

export type FirmSignalsResponse = {
  items: FirmSignal[]
  total: number
  page: number
  limit: number
}

export async function getFirmSignals(
  firmId: string,
  params?: FirmSignalsParams,
  signal?: AbortSignal,
) {
  const { data } = await api.get<FirmSignalsResponse>(`/firms/${firmId}/signals`, {
    params,
    signal,
  })
  return data
}

export async function getFirmScores(firmId: string, signal?: AbortSignal) {
  const { data } = await api.get<FirmScore[]>(`/firms/${firmId}/scores`, { signal })
  return data
}

export async function getFirmScoreByVersion(
  firmId: string,
  version: string,
  signal?: AbortSignal,
) {
  const encoded = encodeURIComponent(version)
  const { data } = await api.get<FirmScore>(`/firms/${firmId}/scores/${encoded}`, {
    signal,
  })
  return data
}
