import { AgGridReact } from 'ag-grid-react'
import { Inbox, Scale } from 'lucide-react'
import { useState } from 'react'

import { EmptyState } from '@/components/empty-state'
import { PageNav } from '@/components/page-nav'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import type { ScoreEvidence } from '@/types/score'

import { evidenceColDefs } from './column-defs'

const PAGE_SIZE = 20

type EvidenceCardProps = {
  evidence: ScoreEvidence[]
}

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(evidence.length / PAGE_SIZE))
  const pagedEvidence = evidence.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  )

  return (
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
            {evidence.length > PAGE_SIZE ? (
              <PageNav
                page={page}
                totalPages={totalPages}
                total={evidence.length}
                label="evidence row(s)"
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
