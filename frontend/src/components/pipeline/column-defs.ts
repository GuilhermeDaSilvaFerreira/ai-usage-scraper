import type { ColDef } from 'ag-grid-community'

import { formatDate, labelFromSnake } from '@/lib/format'
import type { RecentJob } from '@/types/pipeline'

import { StatusCell } from './status-cell'

export const jobColDefs: ColDef<RecentJob>[] = [
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
