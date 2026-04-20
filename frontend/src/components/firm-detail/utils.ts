import { labelFromSnake } from '@/lib/format'
import type { DimensionScoreJson } from '@/types/score'

export type DimensionRow = {
  key: string
  label: string
  description: string
  raw_score: number
  max_possible: number
  weighted_score: number
  signal_count: number
  weight: number | null
  pct: number
}

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  ai_talent_density:
    'Measures how concentrated AI talent is at the firm based on hiring signals. ' +
    'Senior AI/tech hires (Chief, Head of, VP, Director, MD) score the highest (15 pts each, capped at 45). ' +
    'AI team-growth signals add 10 pts each (capped at 30) and general AI hires add 5 pts each (capped at 25). ' +
    'Score is bounded at 100.',
  public_ai_activity:
    'Captures the firm\u2019s public visibility around AI work. ' +
    'AI news mentions are worth 8 pts each (capped at 40), AI case studies 15 pts each (capped at 35), ' +
    'and LinkedIn AI activity 5 pts each (capped at 25). Score is bounded at 100.',
  ai_hiring_velocity:
    'Tracks how fast the firm is hiring for AI roles. ' +
    'Hires from the last 6 months are worth 12 pts each (capped at 50); ' +
    'older hires are worth 5 pts each (capped at 25). ' +
    'A diversity bonus of 5 pts per distinct AI role family ' +
    '(data scientist, ML engineer, data engineer, leadership, analytics) is added (capped at 25). ' +
    'Score is bounded at 100.',
  thought_leadership:
    'Reflects how often firm voices show up in industry conversations on AI. ' +
    'AI conference talks are worth 15 pts each (capped at 40), podcast appearances 12 pts each (capped at 30), ' +
    'and research publications 15 pts each (capped at 30). Score is bounded at 100.',
  vendor_partnerships:
    'Measures the breadth of the firm\u2019s AI vendor and tech-stack relationships. ' +
    'Each unique AI vendor partnership is worth 20 pts (capped at 60), ' +
    'and each tech-stack signal is worth 10 pts (capped at 40). Score is bounded at 100.',
  portfolio_ai_strategy:
    'Evaluates AI activity inside the firm\u2019s portfolio companies. ' +
    'Each portfolio AI initiative is worth 20 pts (capped at 60), ' +
    'and each portfolio-related AI case study is worth 15 pts (capped at 40). Score is bounded at 100.',
}

function numericField(value: unknown, ...keys: string[]): number | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  for (const k of keys) {
    if (typeof v[k] === 'number') return v[k]
  }
  return null
}

function describeDimension(key: string): string {
  return (
    DIMENSION_DESCRIPTIONS[key] ??
    'Scoring breakdown for this dimension is not yet documented. ' +
      'Higher scores reflect more frequent or higher-quality signals of this kind.'
  )
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
      description: describeDimension(key),
      raw_score: raw,
      max_possible: max,
      weighted_score: numericField(val, 'weighted_score', 'weightedScore') ?? 0,
      signal_count: numericField(val, 'signal_count', 'signalCount') ?? 0,
      weight: weights?.[key] ?? null,
      pct,
    }
  })
}
