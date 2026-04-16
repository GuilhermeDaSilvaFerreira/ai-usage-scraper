import { formatScore } from '@/lib/format'

import type { DimensionRow } from './utils'

type DimensionBarProps = {
  dimension: DimensionRow
}

export function DimensionBar({ dimension }: DimensionBarProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{dimension.label}</span>
        <span className="text-sm tabular-nums font-semibold">
          {formatScore(dimension.raw_score)} / {formatScore(dimension.max_possible)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground/70 transition-all"
          style={{ width: `${Math.min(100, dimension.pct)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          Weighted:{' '}
          <strong className="tabular-nums">
            {formatScore(dimension.weighted_score)}
          </strong>
        </span>
        <span>
          Signals: <strong className="tabular-nums">{dimension.signal_count}</strong>
        </span>
        {dimension.weight != null ? (
          <span>
            Weight:{' '}
            <strong className="tabular-nums">
              {(dimension.weight * 100).toFixed(0)}%
            </strong>
          </span>
        ) : null}
      </div>
    </div>
  )
}
