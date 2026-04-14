import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Inbox, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getPipelineStatus } from '@/api/pipeline'
import { EmptyState } from '@/components/empty-state'
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
import { formatDate, labelFromSnake } from '@/lib/format'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import type { PipelineQueues, QueueCounts, RecentJob } from '@/types/pipeline'

const POLL_MS = 15_000

const QUEUE_LABELS: { key: keyof PipelineQueues; label: string }[] = [
  { key: 'seeding', label: 'Seeding' },
  { key: 'signal_collection', label: 'Signal collection' },
  { key: 'people_collection', label: 'People collection' },
  { key: 'extraction', label: 'Extraction' },
  { key: 'scoring', label: 'Scoring' },
]

function QueueCard({ label, counts }: { label: string; counts: QueueCounts }) {
  const items: {
    k: keyof QueueCounts
    label: string
    tone: 'default' | 'secondary' | 'outline'
  }[] = [
    { k: 'waiting', label: 'Waiting', tone: 'secondary' },
    { k: 'active', label: 'Active', tone: 'default' },
    { k: 'completed', label: 'Done', tone: 'outline' },
    { k: 'failed', label: 'Failed', tone: 'outline' },
    { k: 'delayed', label: 'Delayed', tone: 'outline' },
  ]
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.k} variant={item.tone} className="tabular-nums">
            {item.label}: {counts[item.k]}
          </Badge>
        ))}
      </CardContent>
    </Card>
  )
}

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = status.toLowerCase()
  if (s === 'completed') return 'default'
  if (s === 'running' || s === 'active') return 'secondary'
  if (s === 'failed') return 'destructive'
  return 'outline'
}

function StatusCell(props: { value: string }) {
  return (
    <Badge variant={statusVariant(String(props.value))}>
      {labelFromSnake(String(props.value))}
    </Badge>
  )
}

const jobColDefs: ColDef<RecentJob>[] = [
  {
    field: 'type',
    headerName: 'Type',
    flex: 1,
    minWidth: 130,
    valueFormatter: (p) => labelFromSnake(String(p.value)),
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 140,
    cellRenderer: StatusCell,
  },
  {
    field: 'firm_name',
    headerName: 'Firm',
    flex: 1,
    minWidth: 160,
    valueFormatter: (p) => p.value ?? '—',
  },
  {
    field: 'started_at',
    headerName: 'Started',
    width: 170,
    valueFormatter: (p) => formatDate(p.value),
  },
  {
    field: 'completed_at',
    headerName: 'Completed',
    width: 170,
    valueFormatter: (p) => formatDate(p.value),
  },
  {
    field: 'error_message',
    headerName: 'Error',
    flex: 1,
    minWidth: 200,
    valueFormatter: (p) => p.value ?? '—',
  },
]

export function PipelinePage() {
  const [queues, setQueues] = useState<PipelineQueues | null>(null)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    let first = true

    async function load() {
      if (first) setLoading(true)
      setError(null)
      try {
        const data = await getPipelineStatus(ac.signal)
        setQueues(data.queues)
        setRecentJobs(data.recent_jobs)
      } catch (e) {
        if (!ac.signal.aborted)
          setError(getErrorMessage(e, 'Failed to load pipeline status'))
      } finally {
        if (!ac.signal.aborted) {
          if (first) setLoading(false)
          first = false
        }
      }
    }

    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Queue depth and recent scrape jobs. Refreshes every {POLL_MS / 1000}s.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void (async () => {
              try {
                const d = await getPipelineStatus()
                setQueues(d.queues)
                setRecentJobs(d.recent_jobs)
                setError(null)
              } catch (e) {
                setError(getErrorMessage(e, 'Failed to refresh pipeline status'))
              }
            })()
          }}
        >
          Refresh now
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Workflow className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Queues</h2>
        </div>
        {loading && !queues ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : null}
        {queues ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {QUEUE_LABELS.map(({ key, label }) => (
              <QueueCard key={key} label={label} counts={queues[key]} />
            ))}
          </div>
        ) : null}
        {!loading && !queues && !error ? (
          <EmptyState
            icon={Inbox}
            title="No queue data"
            description="Start the backend pipeline to populate queue metrics."
          />
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
          <CardDescription>Latest pipeline activity (newest first).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && recentJobs.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {!loading && recentJobs.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No pipeline jobs recorded"
              description="Jobs will appear here as seeding, collection, extraction, and scoring run."
            />
          ) : null}

          {recentJobs.length > 0 ? (
            <div className="ag-theme-custom" style={{ width: '100%' }}>
              <AgGridReact<RecentJob>
                theme={gridTheme}
                rowData={recentJobs}
                columnDefs={jobColDefs}
                defaultColDef={defaultColDef}
                {...defaultGridOptions}
                pagination
                paginationPageSize={20}
                paginationPageSizeSelector={[10, 20, 50]}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
