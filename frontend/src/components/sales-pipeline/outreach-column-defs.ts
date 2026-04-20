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
    headerName: 'Platforms',
    field: 'contact_platforms',
    width: 180,
    valueGetter: (p) => p.data?.contact_platforms ?? [],
    valueFormatter: (p) => {
      const platforms = (p.value as string[] | undefined) ?? []
      if (platforms.length === 0) return '—'
      return platforms.map((v) => labelFromSnake(v)).join(', ')
    },
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
