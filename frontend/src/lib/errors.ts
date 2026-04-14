import { isAxiosError } from 'axios'

export function getErrorMessage(e: unknown, fallback: string) {
  if (!isAxiosError(e)) return fallback
  const raw = e.response?.data as { message?: string | string[] } | undefined
  const m = raw?.message
  if (Array.isArray(m)) return m.join(', ')
  if (typeof m === 'string') return m
  return e.message || fallback
}
