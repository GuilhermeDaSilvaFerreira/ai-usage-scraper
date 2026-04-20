import type { Paginated, OutreachStatus, ContactPlatform } from '@/types/common'
import type { OutreachCampaign, OutreachStats } from '@/types/outreach'
import { api } from './client'

export type QueryOutreachParams = {
  search?: string
  firm_name?: string
  status?: OutreachStatus
  contact_platforms?: ContactPlatform[]
  firm_id?: string
  page?: number
  limit?: number
}

export async function getOutreachCampaigns(
  params?: QueryOutreachParams,
  signal?: AbortSignal,
) {
  const { contact_platforms, ...rest } = params ?? {}
  const queryParams: Record<string, unknown> = { ...rest }
  if (contact_platforms && contact_platforms.length > 0) {
    queryParams.contact_platforms = contact_platforms.join(',')
  }
  const { data } = await api.get<Paginated<OutreachCampaign>>('/outreach', {
    params: queryParams,
    signal,
  })
  return data
}

export async function getOutreachStats(signal?: AbortSignal) {
  const { data } = await api.get<OutreachStats>('/outreach/stats', { signal })
  return data
}

export async function getOutreachByFirm(firmId: string, signal?: AbortSignal) {
  const { data } = await api.get<OutreachCampaign[]>(`/outreach/firms/${firmId}`, {
    signal,
  })
  return data
}

export async function getOutreachCampaign(id: string, signal?: AbortSignal) {
  const { data } = await api.get<OutreachCampaign>(`/outreach/${id}`, { signal })
  return data
}

export async function getOutreachCampaignByPerson(
  personId: string,
  signal?: AbortSignal,
) {
  const { data } = await api.get<OutreachCampaign>(
    `/outreach/people/${personId}/campaign`,
    { signal },
  )
  return data
}

export async function createOutreachCampaign(body: {
  firm_id: string
  person_id: string
  contacted_by?: string
  contact_platforms?: ContactPlatform[]
  notes?: string
}) {
  const { data } = await api.post<OutreachCampaign>('/outreach', body)
  return data
}

export async function updateOutreachCampaign(
  id: string,
  body: {
    status?: OutreachStatus
    contact_platforms?: ContactPlatform[]
    contacted_by?: string
    notes?: string
    outreach_message?: string
  },
) {
  const { data } = await api.patch<OutreachCampaign>(`/outreach/${id}`, body)
  return data
}

export async function generateCampaignMessage(campaignId: string) {
  const { data } = await api.post<OutreachCampaign>(
    `/outreach/${campaignId}/generate-message`,
  )
  return data
}
