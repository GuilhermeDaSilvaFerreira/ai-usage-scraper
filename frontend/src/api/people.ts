import type { Paginated } from '@/types/common'
import type { Person } from '@/types/person'
import { api } from './client'

export type QueryPeopleParams = {
  search?: string
  role_category?: string
  firm_id?: string
  page?: number
  limit?: number
}

export async function getPeople(params?: QueryPeopleParams, signal?: AbortSignal) {
  const { data } = await api.get<Paginated<Person>>('/people', { params, signal })
  return data
}

export async function getFirmPeople(firmId: string, signal?: AbortSignal) {
  const { data } = await api.get<Person[]>(`/firms/${firmId}/people`, { signal })
  return data
}
