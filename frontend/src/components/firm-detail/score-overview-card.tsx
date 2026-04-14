import { BarChart3, Inbox } from 'lucide-react'
import { useMemo } from 'react'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatDate, formatScore } from '@/lib/format'
import type { DimensionScoreJson, FirmScore } from '@/types/score'

import { DimensionBar } from './dimension-bar'
import { buildDimensionRows } from './utils'

type ScoreOverviewCardProps = {
  score: FirmScore | null
}

export function ScoreOverviewCard({ score }: ScoreOverviewCardProps) {
  const dimensionEntries = Object.entries(score?.dimension_scores ?? {}) as [
    string,
    DimensionScoreJson,
  ][]

  const dimensionRows = useMemo(
    () => buildDimensionRows(dimensionEntries, score?.scoring_parameters?.weights),
    [dimensionEntries, score?.scoring_parameters?.weights],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          Score overview
        </CardTitle>
        <CardDescription>
          {score
            ? `Version ${score.score_version} · ${formatDate(score.scored_at)}`
            : 'No score available for this firm.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!score ? (
          <EmptyState
            icon={Inbox}
            title="No score on file"
            description="Run scoring for this firm to see an overall score and dimensions."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-sm text-muted-foreground">Overall</span>
              <span className="text-3xl font-semibold tabular-nums">
                {formatScore(score.overall_score)}
              </span>
              {score.rank != null ? (
                <Badge variant="secondary" className="tabular-nums">
                  Rank #{score.rank}
                </Badge>
              ) : null}
              <span className="text-sm text-muted-foreground">
                {score.signal_count} signal
                {score.signal_count === 1 ? '' : 's'}
              </span>
            </div>

            {dimensionRows.length === 0 ? (
              <EmptyState
                className="py-6"
                icon={Inbox}
                title="No dimension breakdown"
                description="Dimension scores are empty for this version."
              />
            ) : (
              <div className="space-y-3">
                {dimensionRows.map((dim) => (
                  <DimensionBar key={dim.key} dimension={dim} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
