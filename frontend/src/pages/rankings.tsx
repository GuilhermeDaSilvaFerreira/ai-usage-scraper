import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Inbox } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getRankings } from '@/api/rankings'
import { EmptyState } from '@/components/empty-state'
import { PageNav } from '@/components/page-nav'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import { formatAumUsd, formatDate, formatScore, labelFromSnake } from '@/lib/format'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import { FIRM_TYPES, type FirmType } from '@/types/common'
import type { RankingRow, RankingsResponse } from '@/types/rankings'

const PAGE_SIZE = 25

const colDefs: ColDef<RankingRow>[] = [
  {
    field: 'rank',
    headerName: 'Rank',
    width: 90,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
  },
  {
    field: 'firm_name',
    headerName: 'Name',
    flex: 1,
    minWidth: 180,
    valueFormatter: (p) => p.value ?? '—',
  },
  {
    field: 'firm_type',
    headerName: 'Type',
    width: 150,
    valueFormatter: (p) => (p.value ? labelFromSnake(p.value) : '—'),
  },
  {
    field: 'aum_usd',
    headerName: 'AUM',
    width: 130,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    valueFormatter: (p) => formatAumUsd(p.value ?? null),
  },
  {
    field: 'overall_score',
    headerName: 'Score',
    width: 110,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    field: 'signal_count',
    headerName: 'Signals',
    width: 100,
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
  },
  {
    field: 'scored_at',
    headerName: 'Scored',
    width: 170,
    valueFormatter: (p) => formatDate(p.value),
  },
]

export function RankingsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [firmType, setFirmType] = useState<'all' | FirmType>('all')
  const [data, setData] = useState<RankingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await getRankings(
          {
            page,
            limit: PAGE_SIZE,
            firm_type: firmType === 'all' ? undefined : firmType,
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
  }, [page, firmType])

  const totalPages = data?.total_pages ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Firm rankings</h1>
        <p className="text-sm text-muted-foreground">
          Scored firms ordered by overall score (highest first).
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Ranked list</CardTitle>
            <CardDescription>
              {data
                ? `${data.total} firm${data.total === 1 ? '' : 's'} · version ${data.score_version}`
                : null}
              {loading ? 'Loading counts…' : null}
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-64">
            <span className="text-xs font-medium text-muted-foreground">Firm type</span>
            <Select
              value={firmType}
              onValueChange={(v) => {
                setFirmType(v as 'all' | FirmType)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {FIRM_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {!loading && !error && data && data.items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No firms have been scored yet"
              description="Run the scoring pipeline or check filters. Rankings appear once scores exist for the selected version."
            />
          ) : null}

          {!loading && data && data.items.length > 0 ? (
            <>
              <div className="ag-theme-custom" style={{ width: '100%' }}>
                <AgGridReact<RankingRow>
                  theme={gridTheme}
                  rowData={data.items}
                  columnDefs={colDefs}
                  defaultColDef={defaultColDef}
                  {...defaultGridOptions}
                  rowClass="cursor-pointer"
                  onRowClicked={(e) => {
                    if (e.data?.firm_id) navigate(`/firms/${e.data.firm_id}`)
                  }}
                />
              </div>

              <PageNav
                page={data.page}
                totalPages={totalPages}
                total={data.total}
                label="firm(s)"
                onPageChange={setPage}
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
