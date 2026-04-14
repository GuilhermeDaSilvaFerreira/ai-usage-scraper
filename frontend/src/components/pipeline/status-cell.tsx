import { Badge } from '@/components/ui/badge'
import { labelFromSnake } from '@/lib/format'

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = status.toLowerCase()
  if (s === 'completed') return 'default'
  if (s === 'running' || s === 'active') return 'secondary'
  if (s === 'failed') return 'destructive'
  return 'outline'
}

export function StatusCell(props: { value: string }) {
  return (
    <Badge variant={statusVariant(String(props.value))}>
      {labelFromSnake(String(props.value))}
    </Badge>
  )
}
