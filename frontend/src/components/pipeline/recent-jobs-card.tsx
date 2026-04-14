import { AgGridReact } from 'ag-grid-react'
import { Inbox } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import type { RecentJob } from '@/types/pipeline'

import { jobColDefs } from './column-defs'

type RecentJobsCardProps = {
  jobs: RecentJob[]
  loading: boolean
}

export function RecentJobsCard({ jobs, loading }: RecentJobsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent jobs</CardTitle>
        <CardDescription>Latest pipeline activity (newest first).</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && jobs.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}

        {!loading && jobs.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No pipeline jobs recorded"
            description="Jobs will appear here as seeding, collection, extraction, and scoring run."
          />
        ) : null}

        {jobs.length > 0 ? (
          <div className="ag-theme-custom" style={{ width: '100%' }}>
            <AgGridReact<RecentJob>
              theme={gridTheme}
              rowData={jobs}
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
  )
}
