import type { ColDef } from 'ag-grid-community'

import { formatDate, labelFromSnake } from '@/lib/format'
import type { OutreachCampaign } from '@/types/outreach'

export const outreachColDefs: ColDef<OutreachCampaign>[] = [
  {
    headerName: 'Firm',
    valueGetter: (p) => p.data?.firm?.name ?? '—',
    flex: 1,
    minWidth: 160,
  },
  {
    headerName: 'Person',
    valueGetter: (p) => p.data?.person?.full_name ?? '—',
    flex: 1,
    minWidth: 140,
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 170,
    valueFormatter: (p) => (p.value ? labelFromSnake(p.value) : '—'),
  },
  {
    field: 'contact_platform',
    headerName: 'Platform',
    width: 120,
    valueFormatter: (p) => (p.value ? labelFromSnake(p.value) : '—'),
  },
  {
    field: 'contacted_by',
    headerName: 'Contacted by',
    width: 140,
  },
  {
    field: 'first_contact_at',
    headerName: 'First contact',
    width: 170,
    valueFormatter: (p) => formatDate(p.value),
  },
  {
    field: 'last_status_change_at',
    headerName: 'Last update',
    width: 170,
    valueFormatter: (p) => formatDate(p.value),
  },
]
