import { useEffect, useState } from 'react'

import { getFirmById, getFirmScoreByVersion } from '@/api/firms'
import { getFirmPeople } from '@/api/people'
import { getErrorMessage } from '@/lib/errors'
import type { FirmDetail } from '@/types/firm'
import type { Person } from '@/types/person'
import type { FirmScore } from '@/types/score'

export type FirmDetailState = {
  firm: FirmDetail | null
  people: Person[]
  scoreDetail: FirmScore | null
  loading: boolean
  error: string | null
}

export function useFirmDetail(id: string | undefined): FirmDetailState {
  const [firm, setFirm] = useState<FirmDetail | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [scoreDetail, setScoreDetail] = useState<FirmScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const ac = new AbortController()
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const f = await getFirmById(id, ac.signal)
        setFirm(f)
        const p = await getFirmPeople(id, ac.signal)
        setPeople(p)
        if (f.latest_score?.score_version) {
          try {
            const sc = await getFirmScoreByVersion(
              id,
              f.latest_score.score_version,
              ac.signal,
            )
            setScoreDetail(sc)
          } catch {
            if (!ac.signal.aborted) setScoreDetail(f.latest_score)
          }
        } else {
          setScoreDetail(null)
        }
      } catch (e) {
        if (!ac.signal.aborted) setError(getErrorMessage(e, 'Failed to load firm'))
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [id])

  return { firm, people, scoreDetail, loading, error }
}
