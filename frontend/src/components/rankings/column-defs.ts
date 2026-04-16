import type { ColDef } from 'ag-grid-community'

import { formatAumUsd, formatDate, formatScore, labelFromSnake } from '@/lib/format'
import type { RankingRow } from '@/types/rankings'

export const rankingColDefs: ColDef<RankingRow>[] = [
  {
    field: 'rank',
    headerName: 'Rank',
    width: 90,
    type: 'numericColumn',
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
    valueFormatter: (p) => formatAumUsd(p.value ?? null),
  },
  {
    field: 'overall_score',
    headerName: 'Score',
    width: 110,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    field: 'signal_count',
    headerName: 'Signals',
    width: 100,
    type: 'numericColumn',
  },
  {
    field: 'scored_at',
    headerName: 'Scored',
    width: 170,
    valueFormatter: (p) => formatDate(p.value),
  },
]
