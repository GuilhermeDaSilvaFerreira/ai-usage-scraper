import { AgGridReact } from 'ag-grid-react'
import { Inbox } from 'lucide-react'
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

type RankingsTableCardProps = {
  data: RankingsResponse | null
  loading: boolean
  error: string | null
  page: number
  totalPages: number
  firmType: 'all' | FirmType
  onPageChange: (page: number) => void
  onFirmTypeChange: (type: 'all' | FirmType) => void
}

export function RankingsTableCard({
  data,
  loading,
  error,
  page,
  totalPages,
  firmType,
  onPageChange,
  onFirmTypeChange,
}: RankingsTableCardProps) {
  const navigate = useNavigate()

  return (
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
        <FirmTypeFilter
          value={firmType}
          onChange={(v) => {
            onFirmTypeChange(v)
            onPageChange(1)
          }}
        />
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
        ) : null}
      </CardContent>
    </Card>
  )
}
