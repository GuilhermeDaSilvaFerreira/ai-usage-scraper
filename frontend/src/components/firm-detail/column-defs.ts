import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { createElement } from 'react'

import { formatDate, formatScore, labelFromSnake } from '@/lib/format'
import type { Person } from '@/types/person'
import type { ScoreEvidence } from '@/types/score'

function PersonNameCell(params: ICellRendererParams<Person>) {
  if (!params.value) return createElement('span', null, '—')
  return createElement(
    'span',
    { className: 'text-primary cursor-pointer underline-offset-4 hover:underline' },
    params.value,
  )
}

function LinkedInCell(params: ICellRendererParams<Person>) {
  if (!params.value) return createElement('span', null, '—')
  return createElement(
    'a',
    {
      className: 'text-primary underline-offset-4 hover:underline',
      href: params.value,
      target: '_blank',
      rel: 'noreferrer',
    },
    'Profile',
  )
}

export const peopleColDefs: ColDef<Person>[] = [
  {
    field: 'full_name',
    headerName: 'Name',
    flex: 1,
    minWidth: 140,
    cellRenderer: PersonNameCell,
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
    field: 'email',
    headerName: 'Email',
    width: 180,
    valueFormatter: (p) => p.value ?? '—',
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
    sortable: false,
    cellRenderer: LinkedInCell,
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
