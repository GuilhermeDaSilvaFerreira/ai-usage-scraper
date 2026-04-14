import { QueueCardsSection } from '@/components/pipeline/queue-cards-section'
import { RecentJobsCard } from '@/components/pipeline/recent-jobs-card'
import { Button } from '@/components/ui/button'
import { usePipelineStatus } from '@/hooks/use-pipeline-status'

export function PipelinePage() {
  const { queues, recentJobs, loading, error, pollInterval, refresh } =
    usePipelineStatus()

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Queue depth and recent scrape jobs. Refreshes every {pollInterval / 1000}s.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh}>
          Refresh now
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <QueueCardsSection queues={queues} loading={loading} error={error} />
      <RecentJobsCard jobs={recentJobs} loading={loading} />
    </div>
  )
}
