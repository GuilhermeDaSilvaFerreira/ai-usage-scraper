import { useEffect, useState } from 'react'

import { getFirmSignals, type FirmSignalsResponse } from '@/api/firms'

const SIGNAL_PAGE_SIZE = 20

export type FirmSignalsState = {
  signals: FirmSignalsResponse | null
  signalPage: number
  setSignalPage: (page: number) => void
  signalTotalPages: number
  loading: boolean
}

export function useFirmSignals(firmId: string | undefined): FirmSignalsState {
  const [signals, setSignals] = useState<FirmSignalsResponse | null>(null)
  const [signalPage, setSignalPage] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!firmId) return
    const ac = new AbortController()
    ;(async () => {
      setLoading(true)
      try {
        const s = await getFirmSignals(
          firmId,
          { page: signalPage, limit: SIGNAL_PAGE_SIZE },
          ac.signal,
        )
        setSignals(s)
      } catch {
        if (!ac.signal.aborted) setSignals(null)
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [firmId, signalPage])

  const signalTotalPages =
    signals && signals.total > 0
      ? Math.max(1, Math.ceil(signals.total / SIGNAL_PAGE_SIZE))
      : 1

  return { signals, signalPage, setSignalPage, signalTotalPages, loading }
}
