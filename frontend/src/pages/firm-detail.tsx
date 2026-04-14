import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import {
  BarChart3,
  ChevronLeft,
  Inbox,
  Radio,
  Scale,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  getFirmById,
  getFirmScoreByVersion,
  getFirmSignals,
  type FirmSignalsResponse,
} from '@/api/firms'
import { getFirmPeople } from '@/api/people'
import { EmptyState } from '@/components/empty-state'
import { PageNav } from '@/components/page-nav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import { formatAumUsd, formatDate, formatScore, labelFromSnake } from '@/lib/format'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import type { FirmDetail } from '@/types/firm'
import type { Person } from '@/types/person'
import type { DimensionScoreJson, FirmScore, ScoreEvidence } from '@/types/score'

const SIGNAL_PAGE_SIZE = 20
const EVIDENCE_PAGE_SIZE = 20

function dimensionRawScore(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { raw_score?: unknown; rawScore?: unknown }
  if (typeof v.raw_score === 'number') return v.raw_score
  if (typeof v.rawScore === 'number') return v.rawScore
  return null
}

function dimensionMaxPossible(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { max_possible?: unknown; maxPossible?: unknown }
  if (typeof v.max_possible === 'number') return v.max_possible
  if (typeof v.maxPossible === 'number') return v.maxPossible
  return null
}

function dimensionWeightedScore(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { weighted_score?: unknown; weightedScore?: unknown }
  if (typeof v.weighted_score === 'number') return v.weighted_score
  if (typeof v.weightedScore === 'number') return v.weightedScore
  return null
}

function dimensionSignalCount(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { signal_count?: unknown; signalCount?: unknown }
  if (typeof v.signal_count === 'number') return v.signal_count
  if (typeof v.signalCount === 'number') return v.signalCount
  return null
}

type DimensionRow = {
  key: string
  label: string
  raw_score: number
  max_possible: number
  weighted_score: number
  signal_count: number
  weight: number | null
  pct: number
}

function buildDimensionRows(
  entries: [string, DimensionScoreJson][],
  weights: Record<string, number> | null | undefined,
): DimensionRow[] {
  return entries.map(([key, val]) => {
    const raw = dimensionRawScore(val) ?? 0
    const max = dimensionMaxPossible(val) ?? 0
    const pct = max > 0 ? (raw / max) * 100 : 0
    return {
      key,
      label: labelFromSnake(key),
      raw_score: raw,
      max_possible: max,
      weighted_score: dimensionWeightedScore(val) ?? 0,
      signal_count: dimensionSignalCount(val) ?? 0,
      weight: weights?.[key] ?? null,
      pct,
    }
  })
}

const peopleColDefs: ColDef<Person>[] = [
  {
    field: 'full_name',
    headerName: 'Name',
    flex: 1,
    minWidth: 140,
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 140,
    valueFormatter: (p) => p.value ?? '—',
  },
  {
    field: 'role_category',
    headerName: 'Role',
    width: 160,
    valueFormatter: (p) => (p.value ? labelFromSnake(p.value) : '—'),
  },
  {
    field: 'confidence',
    headerName: 'Confidence',
    width: 120,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    field: 'linkedin_url',
    headerName: 'LinkedIn',
    width: 110,
    filter: false,
    sortable: false,
    cellRenderer: (p: { value: string | null }) =>
      p.value
        ? `<a class="text-primary underline-offset-4 hover:underline" href="${p.value}" target="_blank" rel="noreferrer">Profile</a>`
        : '—',
  },
]

const signalColDefs: ColDef[] = [
  {
    field: 'signal_type',
    headerName: 'Type',
    flex: 1,
    minWidth: 140,
    valueFormatter: (p) => labelFromSnake(p.value),
  },
  {
    field: 'extraction_method',
    headerName: 'Method',
    width: 130,
    valueFormatter: (p) => labelFromSnake(p.value),
  },
  {
    field: 'extraction_confidence',
    headerName: 'Confidence',
    width: 120,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    headerName: 'Source',
    width: 220,
    valueGetter: (p) =>
      p.data?.data_source?.title || p.data?.data_source?.url || p.data?.data_source_id || '—',
  },
  {
    field: 'collected_at',
    headerName: 'Collected',
    width: 170,
    type: 'numericColumn',
    valueFormatter: (p) => formatDate(p.value),
  },
]

const evidenceColDefs: ColDef<ScoreEvidence>[] = [
  {
    field: 'dimension',
    headerName: 'Dimension',
    flex: 1,
    minWidth: 150,
    valueFormatter: (p) => labelFromSnake(p.value),
  },
  {
    field: 'weight_applied',
    headerName: 'Weight',
    width: 100,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    field: 'points_contributed',
    headerName: 'Points',
    width: 100,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    headerName: 'Signal',
    width: 160,
    valueGetter: (p) => (p.data?.signal ? labelFromSnake(p.data.signal.signal_type) : '—'),
  },
  {
    headerName: 'Source',
    width: 200,
    valueGetter: (p) =>
      p.data?.signal?.data_source?.title ||
      p.data?.signal?.data_source?.url ||
      p.data?.signal?.data_source_id ||
      '—',
  },
  {
    field: 'reasoning',
    headerName: 'Reasoning',
    flex: 2,
    minWidth: 200,
    valueFormatter: (p) => p.value ?? '—',
  },
]

export function FirmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [firm, setFirm] = useState<FirmDetail | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [scoreDetail, setScoreDetail] = useState<FirmScore | null>(null)
  const [signals, setSignals] = useState<FirmSignalsResponse | null>(null)
  const [signalPage, setSignalPage] = useState(1)
  const [evidencePage, setEvidencePage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [signalsLoading, setSignalsLoading] = useState(false)
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

  useEffect(() => {
    if (!id) return
    const ac = new AbortController()
    ;(async () => {
      setSignalsLoading(true)
      try {
        const s = await getFirmSignals(
          id,
          { page: signalPage, limit: SIGNAL_PAGE_SIZE },
          ac.signal,
        )
        setSignals(s)
      } catch {
        if (!ac.signal.aborted) setSignals(null)
      } finally {
        if (!ac.signal.aborted) setSignalsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [id, signalPage])

  const activeScore = scoreDetail ?? firm?.latest_score ?? null
  const evidence = activeScore?.evidence ?? []
  const dimensionEntries = Object.entries(activeScore?.dimension_scores ?? {}) as [
    string,
    DimensionScoreJson,
  ][]

  const dimensionRows = useMemo(
    () => buildDimensionRows(dimensionEntries, activeScore?.scoring_parameters?.weights),
    [dimensionEntries, activeScore?.scoring_parameters?.weights],
  )

  const evidenceTotalPages = Math.max(1, Math.ceil(evidence.length / EVIDENCE_PAGE_SIZE))
  const pagedEvidence = evidence.slice(
    (evidencePage - 1) * EVIDENCE_PAGE_SIZE,
    evidencePage * EVIDENCE_PAGE_SIZE,
  )

  const signalTotalPages =
    signals && signals.total > 0
      ? Math.max(1, Math.ceil(signals.total / SIGNAL_PAGE_SIZE))
      : 1

  if (!id) {
    return <p className="text-sm text-muted-foreground">Missing firm id.</p>
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !firm) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
          <Link to="/">
            <ChevronLeft className="size-4" />
            Back to rankings
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? 'Firm not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
          <Link to="/">
            <ChevronLeft className="size-4" />
            Rankings
          </Link>
        </Button>

        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{firm.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {firm.firm_type ? (
                  <Badge variant="secondary">{labelFromSnake(firm.firm_type)}</Badge>
                ) : (
                  <span>—</span>
                )}
                {firm.headquarters ? <span>{firm.headquarters}</span> : null}
                {firm.founded_year ? (
                  <span className="tabular-nums">Est. {firm.founded_year}</span>
                ) : null}
              </div>
            </div>
            {firm.website ? (
              <Button variant="outline" size="sm" asChild>
                <a href={firm.website} target="_blank" rel="noreferrer">
                  Website
                </a>
              </Button>
            ) : null}
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">AUM</dt>
              <dd className="font-medium tabular-nums">{formatAumUsd(firm.aum_usd)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last collected</dt>
              <dd>{formatDate(firm.last_collected_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SEC CRD</dt>
              <dd className="font-mono text-xs">{firm.sec_crd_number ?? '—'}</dd>
            </div>
          </dl>

          {firm.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground text-justify">
              {firm.description}
            </p>
          ) : (
            <EmptyState
              className="py-8"
              icon={Inbox}
              title="No firm description"
              description="Description will appear once collected from sources."
            />
          )}
        </div>
      </div>

      {/* Score Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-muted-foreground" />
            Score overview
          </CardTitle>
          <CardDescription>
            {activeScore
              ? `Version ${activeScore.score_version} · ${formatDate(activeScore.scored_at)}`
              : 'No score available for this firm.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!activeScore ? (
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
                  {formatScore(activeScore.overall_score)}
                </span>
                {activeScore.rank != null ? (
                  <Badge variant="secondary" className="tabular-nums">
                    Rank #{activeScore.rank}
                  </Badge>
                ) : null}
                <span className="text-sm text-muted-foreground">
                  {activeScore.signal_count} signal
                  {activeScore.signal_count === 1 ? '' : 's'}
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
                    <div
                      key={dim.key}
                      className="rounded-lg border bg-card p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{dim.label}</span>
                        <span className="text-sm tabular-nums font-semibold">
                          {formatScore(dim.raw_score)} / {formatScore(dim.max_possible)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-foreground/70 transition-all"
                          style={{ width: `${Math.min(100, dim.pct)}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          Weighted: <strong className="tabular-nums">{formatScore(dim.weighted_score)}</strong>
                        </span>
                        <span>
                          Signals: <strong className="tabular-nums">{dim.signal_count}</strong>
                        </span>
                        {dim.weight != null ? (
                          <span>
                            Weight: <strong className="tabular-nums">{(dim.weight * 100).toFixed(0)}%</strong>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Key People */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            Key people
          </CardTitle>
          <CardDescription>
            People linked to this firm for AI-related roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {people.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No key people found"
              description="People appear after the people collection stage runs."
            />
          ) : (
            <div className="ag-theme-custom" style={{ width: '100%' }}>
              <AgGridReact<Person>
                theme={gridTheme}
                rowData={people}
                columnDefs={peopleColDefs}
                defaultColDef={defaultColDef}
                {...defaultGridOptions}
                pagination
                paginationPageSize={20}
                paginationPageSizeSelector={[10, 20, 50]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signals (server-side pagination) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-5 text-muted-foreground" />
            Signals
          </CardTitle>
          <CardDescription>
            Collected signals with extraction metadata and sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signalsLoading && !signals ? <Skeleton className="h-24 w-full" /> : null}
          {!signalsLoading && signals && signals.items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No signals collected"
              description="Signals show up after signal collection and extraction complete."
            />
          ) : null}
          {signals && signals.items.length > 0 ? (
            <>
              <div className="ag-theme-custom" style={{ width: '100%' }}>
                <AgGridReact
                  theme={gridTheme}
                  rowData={signals.items}
                  columnDefs={signalColDefs}
                  defaultColDef={defaultColDef}
                  {...defaultGridOptions}
                />
              </div>
              <PageNav
                page={signalPage}
                totalPages={signalTotalPages}
                total={signals.total}
                label="signal(s)"
                onPageChange={setSignalPage}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Scoring Evidence (client-side pagination) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-5 text-muted-foreground" />
            Scoring evidence
          </CardTitle>
          <CardDescription>
            How signals fed the score, including linked datasource where available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {evidence.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No scoring evidence"
              description="Evidence rows attach when a score version is produced from signals."
            />
          ) : (
            <>
              <div className="ag-theme-custom" style={{ width: '100%' }}>
                <AgGridReact<ScoreEvidence>
                  theme={gridTheme}
                  rowData={pagedEvidence}
                  columnDefs={evidenceColDefs}
                  defaultColDef={defaultColDef}
                  {...defaultGridOptions}
                />
              </div>
              {evidence.length > EVIDENCE_PAGE_SIZE ? (
                <PageNav
                  page={evidencePage}
                  totalPages={evidenceTotalPages}
                  total={evidence.length}
                  label="evidence row(s)"
                  onPageChange={setEvidencePage}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
