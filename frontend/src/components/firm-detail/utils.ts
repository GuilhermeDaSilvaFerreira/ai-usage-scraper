import { labelFromSnake } from '@/lib/format'
import type { DimensionScoreJson } from '@/types/score'

export type DimensionRow = {
  key: string
  label: string
  raw_score: number
  max_possible: number
  weighted_score: number
  signal_count: number
  weight: number | null
  pct: number
}

function numericField(value: unknown, ...keys: string[]): number | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  for (const k of keys) {
    if (typeof v[k] === 'number') return v[k]
  }
  return null
}

export function buildDimensionRows(
  entries: [string, DimensionScoreJson][],
  weights: Record<string, number> | null | undefined,
): DimensionRow[] {
  return entries.map(([key, val]) => {
    const raw = numericField(val, 'raw_score', 'rawScore') ?? 0
    const max = numericField(val, 'max_possible', 'maxPossible') ?? 0
    const pct = max > 0 ? (raw / max) * 100 : 0
    return {
      key,
      label: labelFromSnake(key),
      raw_score: raw,
      max_possible: max,
      weighted_score: numericField(val, 'weighted_score', 'weightedScore') ?? 0,
      signal_count: numericField(val, 'signal_count', 'signalCount') ?? 0,
      weight: weights?.[key] ?? null,
      pct,
    }
  })
}
