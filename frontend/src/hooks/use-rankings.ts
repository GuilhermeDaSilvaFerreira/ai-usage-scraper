import { useEffect, useState } from 'react'

import { getRankings } from '@/api/rankings'
import { getErrorMessage } from '@/lib/errors'
import type { FirmType } from '@/types/common'
import type { RankingsResponse } from '@/types/rankings'

const PAGE_SIZE = 25

export type RankingsState = {
  data: RankingsResponse | null
  page: number
  setPage: (page: number) => void
  firmType: 'all' | FirmType
  setFirmType: (type: 'all' | FirmType) => void
  firmName: string
  setFirmName: (name: string) => void
  totalPages: number
  loading: boolean
  error: string | null
}

export function useRankings(): RankingsState {
  const [page, setPage] = useState(1)
  const [firmType, setFirmType] = useState<'all' | FirmType>('all')
  const [firmName, setFirmName] = useState('')
  const [data, setData] = useState<RankingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const trimmed = firmName.trim()
        const res = await getRankings(
          {
            page,
            limit: PAGE_SIZE,
            firm_type: firmType === 'all' ? undefined : firmType,
            firm_name: trimmed.length > 0 ? trimmed : undefined,
          },
          ac.signal,
        )
        setData(res)
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(getErrorMessage(e, 'Failed to load rankings'))
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [page, firmType, firmName])

  const totalPages = data?.total_pages ?? 0

  return {
    data,
    page,
    setPage,
    firmType,
    setFirmType,
    firmName,
    setFirmName,
    totalPages,
    loading,
    error,
  }
}
