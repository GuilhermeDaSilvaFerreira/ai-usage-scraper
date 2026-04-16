import { RankingsTableCard } from '@/components/rankings/rankings-table-card'
import { useRankings } from '@/hooks/use-rankings'

export function RankingsPage() {
  const { data, page, setPage, firmType, setFirmType, totalPages, loading, error } =
    useRankings()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Firms</h1>
        <p className="text-sm text-muted-foreground">
          Scored firms ordered by overall score (highest first).
        </p>
      </div>

      <RankingsTableCard
        data={data}
        loading={loading}
        error={error}
        page={page}
        totalPages={totalPages}
        firmType={firmType}
        onPageChange={setPage}
        onFirmTypeChange={setFirmType}
      />
    </div>
  )
}
