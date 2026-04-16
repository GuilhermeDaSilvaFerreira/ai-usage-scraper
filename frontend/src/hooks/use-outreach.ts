import { useCallback, useEffect, useState } from 'react'

import {
  getOutreachCampaigns,
  getOutreachStats,
  type QueryOutreachParams,
} from '@/api/outreach'
import { getErrorMessage } from '@/lib/errors'
import type { Paginated } from '@/types/common'
import type { OutreachCampaign, OutreachStats } from '@/types/outreach'

export function useOutreach(initialParams?: QueryOutreachParams) {
  const [campaigns, setCampaigns] = useState<Paginated<OutreachCampaign> | null>(null)
  const [stats, setStats] = useState<OutreachStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<QueryOutreachParams>(initialParams ?? {})

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const [campaignData, statsData] = await Promise.all([
          getOutreachCampaigns(params, signal),
          getOutreachStats(signal),
        ])
        setCampaigns(campaignData)
        setStats(statsData)
      } catch (err) {
        if (signal?.aborted) return
        setError(getErrorMessage(err, 'Failed to load outreach data'))
      } finally {
        setLoading(false)
      }
    },
    [params],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const refresh = useCallback(() => load(), [load])

  return { campaigns, stats, loading, error, params, setParams, refresh }
}
