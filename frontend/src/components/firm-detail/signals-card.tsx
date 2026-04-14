import { AgGridReact } from 'ag-grid-react'
import { Inbox, Radio } from 'lucide-react'

import type { FirmSignalsResponse } from '@/api/firms'
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

import { signalColDefs } from './column-defs'

type SignalsCardProps = {
  signals: FirmSignalsResponse | null
  loading: boolean
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function SignalsCard({
  signals,
  loading,
  page,
  totalPages,
  onPageChange,
}: SignalsCardProps) {
  return (
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
        {loading && !signals ? <Skeleton className="h-24 w-full" /> : null}
        {!loading && signals && signals.items.length === 0 ? (
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
              page={page}
              totalPages={totalPages}
              total={signals.total}
              label="signal(s)"
              onPageChange={onPageChange}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
