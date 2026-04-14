import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { QueueCounts } from '@/types/pipeline'

const QUEUE_ITEMS: {
  k: keyof QueueCounts
  label: string
  tone: 'default' | 'secondary' | 'outline'
}[] = [
  { k: 'waiting', label: 'Waiting', tone: 'secondary' },
  { k: 'active', label: 'Active', tone: 'default' },
  { k: 'completed', label: 'Done', tone: 'outline' },
  { k: 'failed', label: 'Failed', tone: 'outline' },
  { k: 'delayed', label: 'Delayed', tone: 'outline' },
]

type QueueCardProps = {
  label: string
  counts: QueueCounts
}

export function QueueCard({ label, counts }: QueueCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {QUEUE_ITEMS.map((item) => (
          <Badge key={item.k} variant={item.tone} className="tabular-nums">
            {item.label}: {counts[item.k]}
          </Badge>
        ))}
      </CardContent>
    </Card>
  )
}
