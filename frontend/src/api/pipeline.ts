import type { PipelineStatus } from '@/types/pipeline'
import { api } from './client'

export async function getPipelineStatus(signal?: AbortSignal) {
  const { data } = await api.get<PipelineStatus>('/pipeline/status', { signal })
  return data
}
