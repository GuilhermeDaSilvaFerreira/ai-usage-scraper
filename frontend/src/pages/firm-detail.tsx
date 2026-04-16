import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EvidenceCard } from '@/components/firm-detail/evidence-card'
import { FirmHeader } from '@/components/firm-detail/firm-header'
import { PeopleCard } from '@/components/firm-detail/people-card'
import { ScoreOverviewCard } from '@/components/firm-detail/score-overview-card'
import { SignalsCard } from '@/components/firm-detail/signals-card'
import { FirmOutreachCard } from '@/components/sales-pipeline/firm-outreach-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useFirmDetail } from '@/hooks/use-firm-detail'
import { useFirmSignals } from '@/hooks/use-firm-signals'

export function FirmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { firm, people, scoreDetail, loading, error } = useFirmDetail(id)
  const {
    signals,
    signalPage,
    setSignalPage,
    signalTotalPages,
    loading: signalsLoading,
  } = useFirmSignals(id)

  const activeScore = scoreDetail ?? firm?.latest_score ?? null

  if (!id) {
    return <p className="text-sm text-muted-foreground">Missing firm id.</p>
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !firm) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
          <Link to="/">
            <ChevronLeft className="size-4" />
            Back to rankings
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? 'Firm not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <FirmHeader firm={firm} />
      <ScoreOverviewCard score={activeScore} />
      <PeopleCard people={people} />
      <SignalsCard
        signals={signals}
        loading={signalsLoading}
        page={signalPage}
        totalPages={signalTotalPages}
        onPageChange={setSignalPage}
      />
      <EvidenceCard evidence={activeScore?.evidence ?? []} />
      <FirmOutreachCard firmId={id} />
    </div>
  )
}
