import { Info } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatScore } from '@/lib/format'

import type { DimensionRow } from './utils'

type DimensionBarProps = {
  dimension: DimensionRow
}

export function DimensionBar({ dimension }: DimensionBarProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <DimensionHeader dimension={dimension} />
      <DimensionProgress pct={dimension.pct} />
      <DimensionMeta dimension={dimension} />
    </div>
  )
}

function DimensionHeader({ dimension }: { dimension: DimensionRow }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{dimension.label}</span>
        <DimensionInfoIcon label={dimension.label} description={dimension.description} />
      </div>
      <span className="text-sm tabular-nums font-semibold">
        {formatScore(dimension.raw_score)} / {formatScore(dimension.max_possible)}
      </span>
    </div>
  )
}

function DimensionInfoIcon({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          className="inline-flex items-center cursor-default text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        >
          <Info className="size-3.5 pointer-events-none" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">
        {description}
      </TooltipContent>
    </Tooltip>
  )
}

function DimensionProgress({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-foreground/70 transition-all"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

function DimensionMeta({ dimension }: { dimension: DimensionRow }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <MetaItem label="Weighted" value={formatScore(dimension.weighted_score)} />
      <MetaItem label="Signals" value={dimension.signal_count} />
      {dimension.weight != null ? (
        <MetaItem label="Weight" value={`${(dimension.weight * 100).toFixed(0)}%`} />
      ) : null}
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      {label}: <strong className="tabular-nums">{value}</strong>
    </span>
  )
}
