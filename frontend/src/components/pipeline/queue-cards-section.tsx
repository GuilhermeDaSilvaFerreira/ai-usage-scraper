import { Inbox, Workflow } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import type { PipelineQueues } from '@/types/pipeline'

import { QueueCard } from './queue-card'

const QUEUE_LABELS: { key: keyof PipelineQueues; label: string }[] = [
  { key: 'seeding', label: 'Seeding' },
  { key: 'signal_collection', label: 'Signal collection' },
  { key: 'people_collection', label: 'People collection' },
  { key: 'extraction', label: 'Extraction' },
  { key: 'scoring', label: 'Scoring' },
]

type QueueCardsSectionProps = {
  queues: PipelineQueues | null
  loading: boolean
  error: string | null
}

export function QueueCardsSection({ queues, loading, error }: QueueCardsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Workflow className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Queues</h2>
      </div>
      {loading && !queues ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}
      {queues ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {QUEUE_LABELS.map(({ key, label }) => (
            <QueueCard key={key} label={label} counts={queues[key]} />
          ))}
        </div>
      ) : null}
      {!loading && !queues && !error ? (
        <EmptyState
          icon={Inbox}
          title="No queue data"
          description="Start the backend pipeline to populate queue metrics."
        />
      ) : null}
    </section>
  )
}
