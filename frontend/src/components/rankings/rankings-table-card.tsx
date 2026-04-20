import { AgGridReact } from 'ag-grid-react'
import { Inbox } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/empty-state'
import { PageNav } from '@/components/page-nav'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import type { FirmType } from '@/types/common'
import type { RankingsResponse } from '@/types/rankings'

import { rankingColDefs } from './column-defs'
import { FirmTypeFilter } from './firm-type-filter'

const NAME_DEBOUNCE_MS = 300

const NAME_INPUT_CLASS =
  'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

type RankingsTableCardProps = {
  data: RankingsResponse | null
  loading: boolean
  error: string | null
  page: number
  totalPages: number
  firmType: 'all' | FirmType
  firmName: string
  onPageChange: (page: number) => void
  onFirmTypeChange: (type: 'all' | FirmType) => void
  onFirmNameChange: (name: string) => void
}

export function RankingsTableCard({
  data,
  loading,
  error,
  page,
  totalPages,
  firmType,
  firmName,
  onPageChange,
  onFirmTypeChange,
  onFirmNameChange,
}: RankingsTableCardProps) {
  return (
    <Card>
      <RankingsCardHeader
        data={data}
        loading={loading}
        firmType={firmType}
        firmName={firmName}
        onFirmTypeChange={onFirmTypeChange}
        onFirmNameChange={onFirmNameChange}
        onPageChange={onPageChange}
      />
      <CardContent className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}

        {loading ? <LoadingSkeleton /> : null}

        {!loading && !error && data && data.items.length === 0 ? (
          <RankingsEmptyState />
        ) : null}

        {!loading && data && data.items.length > 0 ? (
          <RankingsTable
            data={data}
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function RankingsCardHeader({
  data,
  loading,
  firmType,
  firmName,
  onFirmTypeChange,
  onFirmNameChange,
  onPageChange,
}: {
  data: RankingsResponse | null
  loading: boolean
  firmType: 'all' | FirmType
  firmName: string
  onFirmTypeChange: (type: 'all' | FirmType) => void
  onFirmNameChange: (name: string) => void
  onPageChange: (page: number) => void
}) {
  return (
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
      <RankingsFilters
        firmType={firmType}
        firmName={firmName}
        onFirmTypeChange={onFirmTypeChange}
        onFirmNameChange={onFirmNameChange}
        onPageChange={onPageChange}
      />
    </CardHeader>
  )
}

function RankingsFilters({
  firmType,
  firmName,
  onFirmTypeChange,
  onFirmNameChange,
  onPageChange,
}: {
  firmType: 'all' | FirmType
  firmName: string
  onFirmTypeChange: (type: 'all' | FirmType) => void
  onFirmNameChange: (name: string) => void
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
      <FirmNameSearch value={firmName} onChange={onFirmNameChange} />
      <FirmTypeFilter
        value={firmType}
        onChange={(v) => {
          onFirmTypeChange(v)
          onPageChange(1)
        }}
      />
    </div>
  )
}

function FirmNameSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [input, setInput] = useState(value)

  useEffect(() => {
    setInput(value)
  }, [value])

  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === value.trim()) return
    const handle = window.setTimeout(() => onChange(trimmed), NAME_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [input, value, onChange])

  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <span className="text-xs font-medium text-muted-foreground">Firm name</span>
      <input
        type="text"
        placeholder="Search by name…"
        className={NAME_INPUT_CLASS}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function RankingsEmptyState() {
  return (
    <EmptyState
      icon={Inbox}
      title="No firms match the current filters"
      description="Try clearing the name or type filters, or run scoring to populate rankings for the selected version."
    />
  )
}

function RankingsTable({
  data,
  page,
  totalPages,
  onPageChange,
}: {
  data: RankingsResponse
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const navigate = useNavigate()
  return (
    <>
      <div className="ag-theme-custom" style={{ width: '100%' }}>
        <AgGridReact
          theme={gridTheme}
          rowData={data.items}
          columnDefs={rankingColDefs}
          defaultColDef={defaultColDef}
          {...defaultGridOptions}
          rowClass="cursor-pointer"
          onRowClicked={(e) => {
            if (e.data?.firm_id) navigate(`/firms/${e.data.firm_id}`)
          }}
        />
      </div>
      <PageNav
        page={page}
        totalPages={totalPages}
        total={data.total}
        label="firm(s)"
        onPageChange={onPageChange}
      />
    </>
  )
}
