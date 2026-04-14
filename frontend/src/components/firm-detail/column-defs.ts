import type { ColDef } from 'ag-grid-community'

import { formatDate, formatScore, labelFromSnake } from '@/lib/format'
import type { Person } from '@/types/person'
import type { ScoreEvidence } from '@/types/score'

export const peopleColDefs: ColDef<Person>[] = [
  {
    field: 'full_name',
    headerName: 'Name',
    flex: 1,
    minWidth: 140,
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 140,
    valueFormatter: (p) => p.value ?? '—',
  },
  {
    field: 'role_category',
    headerName: 'Role',
    width: 160,
    valueFormatter: (p) => (p.value ? labelFromSnake(p.value) : '—'),
  },
  {
    field: 'confidence',
    headerName: 'Confidence',
    width: 120,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    field: 'linkedin_url',
    headerName: 'LinkedIn',
    width: 110,
    filter: false,
    sortable: false,
    cellRenderer: (p: { value: string | null }) =>
      p.value
        ? `<a class="text-primary underline-offset-4 hover:underline" href="${p.value}" target="_blank" rel="noreferrer">Profile</a>`
        : '—',
  },
]

export const signalColDefs: ColDef[] = [
  {
    field: 'signal_type',
    headerName: 'Type',
    flex: 1,
    minWidth: 140,
    valueFormatter: (p) => labelFromSnake(p.value),
  },
  {
    field: 'extraction_method',
    headerName: 'Method',
    width: 130,
    valueFormatter: (p) => labelFromSnake(p.value),
  },
  {
    field: 'extraction_confidence',
    headerName: 'Confidence',
    width: 120,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    headerName: 'Source',
    width: 220,
    valueGetter: (p) =>
      p.data?.data_source?.title || p.data?.data_source?.url || p.data?.data_source_id || '—',
  },
  {
    field: 'collected_at',
    headerName: 'Collected',
    width: 170,
    type: 'numericColumn',
    valueFormatter: (p) => formatDate(p.value),
  },
]

export const evidenceColDefs: ColDef<ScoreEvidence>[] = [
  {
    field: 'dimension',
    headerName: 'Dimension',
    flex: 1,
    minWidth: 150,
    valueFormatter: (p) => labelFromSnake(p.value),
  },
  {
    field: 'weight_applied',
    headerName: 'Weight',
    width: 100,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    field: 'points_contributed',
    headerName: 'Points',
    width: 100,
    type: 'numericColumn',
    valueFormatter: (p) => formatScore(p.value),
  },
  {
    headerName: 'Signal',
    width: 160,
    valueGetter: (p) => (p.data?.signal ? labelFromSnake(p.data.signal.signal_type) : '—'),
  },
  {
    headerName: 'Source',
    width: 200,
    valueGetter: (p) =>
      p.data?.signal?.data_source?.title ||
      p.data?.signal?.data_source?.url ||
      p.data?.signal?.data_source_id ||
      '—',
  },
  {
    field: 'reasoning',
    headerName: 'Reasoning',
    flex: 2,
    minWidth: 200,
    valueFormatter: (p) => p.value ?? '—',
  },
]
