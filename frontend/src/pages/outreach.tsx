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
import {
  OUTREACH_STATUSES,
  CONTACT_PLATFORMS,
  type ContactPlatform,
  type OutreachStatus,
  type Paginated,
} from '@/types/common'
import type { OutreachCampaign, OutreachStats } from '@/types/outreach'

type PaginatedOutreach = Paginated<OutreachCampaign>

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
        contact_platforms: value === '__all__' ? undefined : [value as ContactPlatform],
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
      <PageHeader onRefresh={refresh} />

      {error ? <ErrorBanner message={error} /> : null}

      <OutreachStatsBar stats={stats} />

      <CampaignsCard
        campaigns={campaigns}
        stats={stats}
        loading={loading}
        params={params}
        page={page}
        totalPages={totalPages}
        firmNameInput={firmNameInput}
        searchInput={searchInput}
        onFirmNameChange={setFirmNameInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={onSearchSubmit}
        onStatusFilter={onStatusFilter}
        onPlatformFilter={onPlatformFilter}
        onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
        onRowClick={(id) => navigate(`/campaigns/${id}`)}
      />
    </div>
  )
}

function PageHeader({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Track sales outreach campaigns across PE firms.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
        Refresh
      </Button>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}

type CampaignsCardProps = {
  campaigns: PaginatedOutreach | null
  stats: OutreachStats | null
  loading: boolean
  params: ReturnType<typeof useOutreach>['params']
  page: number
  totalPages: number
  firmNameInput: string
  searchInput: string
  onFirmNameChange: (value: string) => void
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onStatusFilter: (value: string) => void
  onPlatformFilter: (value: string) => void
  onPageChange: (page: number) => void
  onRowClick: (id: string) => void
}

function CampaignsCard({
  campaigns,
  loading,
  params,
  page,
  totalPages,
  firmNameInput,
  searchInput,
  onFirmNameChange,
  onSearchChange,
  onSearchSubmit,
  onStatusFilter,
  onPlatformFilter,
  onPageChange,
  onRowClick,
}: CampaignsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-5 text-muted-foreground" />
            Campaigns
          </CardTitle>
          <CampaignsToolbar
            params={params}
            firmNameInput={firmNameInput}
            searchInput={searchInput}
            onFirmNameChange={onFirmNameChange}
            onSearchChange={onSearchChange}
            onSearchSubmit={onSearchSubmit}
            onStatusFilter={onStatusFilter}
            onPlatformFilter={onPlatformFilter}
          />
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
          <CampaignsGrid
            campaigns={campaigns}
            loading={loading}
            onRowClick={onRowClick}
          />
        )}

        {campaigns && totalPages > 1 && (
          <PageNav
            page={page}
            totalPages={totalPages}
            total={campaigns.total}
            label="campaign(s)"
            onPageChange={onPageChange}
          />
        )}
      </CardContent>
    </Card>
  )
}

type CampaignsToolbarProps = {
  params: CampaignsCardProps['params']
  firmNameInput: string
  searchInput: string
  onFirmNameChange: (value: string) => void
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onStatusFilter: (value: string) => void
  onPlatformFilter: (value: string) => void
}

function CampaignsToolbar({
  params,
  firmNameInput,
  searchInput,
  onFirmNameChange,
  onSearchChange,
  onSearchSubmit,
  onStatusFilter,
  onPlatformFilter,
}: CampaignsToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <SearchInputs
        firmNameInput={firmNameInput}
        searchInput={searchInput}
        onFirmNameChange={onFirmNameChange}
        onSearchChange={onSearchChange}
        onSubmit={onSearchSubmit}
      />
      <StatusFilter value={params.status ?? '__all__'} onChange={onStatusFilter} />
      <PlatformFilter
        value={params.contact_platforms?.[0] ?? '__all__'}
        onChange={onPlatformFilter}
      />
    </div>
  )
}

function SearchInputs({
  firmNameInput,
  searchInput,
  onFirmNameChange,
  onSearchChange,
  onSubmit,
}: {
  firmNameInput: string
  searchInput: string
  onFirmNameChange: (value: string) => void
  onSearchChange: (value: string) => void
  onSubmit: () => void
}) {
  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSubmit()
  }

  return (
    <div className="flex gap-1">
      <input
        type="text"
        placeholder="Search firm..."
        className={INPUT_CLASS}
        value={firmNameInput}
        onChange={(e) => onFirmNameChange(e.target.value)}
        onKeyDown={handleEnter}
      />
      <input
        type="text"
        placeholder="Search person..."
        className={INPUT_CLASS}
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleEnter}
      />
      <Button type="button" variant="outline" size="sm" onClick={onSubmit}>
        Search
      </Button>
    </div>
  )
}

function StatusFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
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
  )
}

function PlatformFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
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
  )
}

function CampaignsGrid({
  campaigns,
  loading,
  onRowClick,
}: {
  campaigns: PaginatedOutreach | null
  loading: boolean
  onRowClick: (id: string) => void
}) {
  return (
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
          if (e.data) onRowClick(e.data.id)
        }}
      />
    </div>
  )
}
