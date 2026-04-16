import { Badge } from '@/components/ui/badge'
import { labelFromSnake } from '@/lib/format'
import type { OutreachStatus } from '@/types/common'

const variantMap: Record<
  OutreachStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  not_contacted: 'outline',
  first_contact_sent: 'secondary',
  follow_up_sent: 'secondary',
  replied: 'default',
  under_negotiation: 'default',
  declined: 'destructive',
  closed_won: 'default',
  closed_lost: 'destructive',
}

export function OutreachStatusBadge({ status }: { status: OutreachStatus }) {
  return (
    <Badge variant={variantMap[status] ?? 'outline'}>{labelFromSnake(status)}</Badge>
  )
}
