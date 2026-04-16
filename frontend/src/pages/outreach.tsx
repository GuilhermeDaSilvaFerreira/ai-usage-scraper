import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { Megaphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/empty-state'
import { PageNav } from '@/components/page-nav'
import { OutreachStatsBar } from '@/components/sales-pipeline/outreach-stats-bar'
import { outreachColDefs } from '@/components/sales-pipeline/outreach-column-defs'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import { useOutreach } from '@/hooks/use-outreach'
import { OUTREACH_STATUSES, CONTACT_PLATFORMS, type OutreachStatus } from '@/types/common'
import type { OutreachCampaign } from '@/types/outreach'

const INPUT_CLASS =
  'flex h-7 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 w-40'

export function OutreachPage() {
  const { campaigns, stats, loading, error, params, setParams, refresh } = useOutreach()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [firmNameInput, setFirmNameInput] = useState('')

  const onStatusFilter = useCallback(
    (value: string) => {
      setParams((prev) => ({
        ...prev,
        status: value === '__all__' ? undefined : (value as OutreachStatus),
        page: 1,
      }))
    },
    [setParams],
  )

  const onPlatformFilter = useCallback(
    (value: string) => {
      setParams((prev) => ({
        ...prev,
        contact_platform:
          value === '__all__' ? undefined : (value as 'email' | 'linkedin' | 'phone' | 'other'),
        page: 1,
      }))
    },
    [setParams],
  )

  const onSearchSubmit = useCallback(() => {
    setParams((prev) => ({
      ...prev,
      search: searchInput.trim() || undefined,
      firm_name: firmNameInput.trim() || undefined,
      page: 1,
    }))
  }, [searchInput, firmNameInput, setParams])

  const page = params.page ?? 1
  const totalPages = campaigns?.total_pages ?? 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Track sales outreach campaigns across PE firms.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <OutreachStatsBar stats={stats} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-5 text-muted-foreground" />
              Campaigns
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Search firm..."
                  className={INPUT_CLASS}
                  value={firmNameInput}
                  onChange={(e) => setFirmNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSearchSubmit()
                  }}
                />
                <input
                  type="text"
                  placeholder="Search person..."
                  className={INPUT_CLASS}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSearchSubmit()
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={onSearchSubmit}>
                  Search
                </Button>
              </div>
              <Select
                value={params.status ?? '__all__'}
                onValueChange={onStatusFilter}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  {OUTREACH_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={params.contact_platform ?? '__all__'}
                onValueChange={onPlatformFilter}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="All platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All platforms</SelectItem>
                  {CONTACT_PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loading && campaigns && campaigns.items.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              description="Campaigns are created automatically after firms are scored."
            />
          ) : (
            <div className="ag-theme-custom" style={{ width: '100%' }}>
              <AgGridReact<OutreachCampaign>
                theme={gridTheme}
                loading={loading}
                rowData={campaigns?.items ?? []}
                columnDefs={outreachColDefs}
                defaultColDef={defaultColDef}
                {...defaultGridOptions}
                rowClass="cursor-pointer"
                onRowClicked={(e) => {
                  if (e.data) navigate(`/campaigns/${e.data.id}`)
                }}
              />
            </div>
          )}

          {campaigns && totalPages > 1 && (
            <PageNav
              page={page}
              totalPages={totalPages}
              total={campaigns.total}
              label="campaign(s)"
              onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
