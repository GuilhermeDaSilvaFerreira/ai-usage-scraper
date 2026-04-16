import { Card, CardContent } from '@/components/ui/card'
import { labelFromSnake } from '@/lib/format'
import type { OutreachStats } from '@/types/outreach'

const STATUS_ORDER = [
  'not_contacted',
  'first_contact_sent',
  'follow_up_sent',
  'replied',
  'under_negotiation',
  'declined',
  'closed_won',
  'closed_lost',
] as const

export function OutreachStatsBar({ stats }: { stats: OutreachStats | null }) {
  if (!stats) return null

  const total = Object.values(stats).reduce((s, n) => s + n, 0)

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-4 py-4">
        <div className="flex flex-col items-center gap-0.5 pr-4 border-r border-border">
          <span className="text-2xl font-bold">{total}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
        {STATUS_ORDER.map((status) => (
          <div key={status} className="flex flex-col items-center gap-0.5 min-w-16">
            <span className="text-lg font-semibold">{stats[status] ?? 0}</span>
            <span className="text-[10px] leading-tight text-center text-muted-foreground">
              {labelFromSnake(status)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
