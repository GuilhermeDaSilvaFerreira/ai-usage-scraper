import { useCallback, useEffect, useState } from 'react'

import { getPipelineStatus } from '@/api/pipeline'
import { getErrorMessage } from '@/lib/errors'
import type { PipelineQueues, RecentJob } from '@/types/pipeline'

const POLL_MS = 15_000

export type PipelineStatusState = {
  queues: PipelineQueues | null
  recentJobs: RecentJob[]
  loading: boolean
  error: string | null
  pollInterval: number
  refresh: () => void
}

export function usePipelineStatus(): PipelineStatusState {
  const [queues, setQueues] = useState<PipelineQueues | null>(null)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    let first = true

    async function load() {
      if (first) setLoading(true)
      setError(null)
      try {
        const data = await getPipelineStatus(ac.signal)
        setQueues(data.queues)
        setRecentJobs(data.recent_jobs)
      } catch (e) {
        if (!ac.signal.aborted)
          setError(getErrorMessage(e, 'Failed to load pipeline status'))
      } finally {
        if (!ac.signal.aborted) {
          if (first) setLoading(false)
          first = false
        }
      }
    }

    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const d = await getPipelineStatus()
      setQueues(d.queues)
      setRecentJobs(d.recent_jobs)
      setError(null)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to refresh pipeline status'))
    }
  }, [])

  return { queues, recentJobs, loading, error, pollInterval: POLL_MS, refresh }
}
