import type { JobType, JobStatus } from './common'

export type QueueCounts = {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export type PipelineQueues = {
  seeding: QueueCounts
  signal_collection: QueueCounts
  people_collection: QueueCounts
  extraction: QueueCounts
  scoring: QueueCounts
}

export type RecentJob = {
  id: string
  type: JobType | string
  status: JobStatus | string
  firm_name: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
}

export type PipelineStatus = {
  queues: PipelineQueues
  recent_jobs: RecentJob[]
}
