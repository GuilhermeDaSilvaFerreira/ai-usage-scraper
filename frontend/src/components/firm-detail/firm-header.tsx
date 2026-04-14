import { ChevronLeft, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatAumUsd, formatDate, labelFromSnake } from '@/lib/format'
import type { FirmDetail } from '@/types/firm'

type FirmHeaderProps = {
  firm: FirmDetail
}

export function FirmHeader({ firm }: FirmHeaderProps) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
        <Link to="/">
          <ChevronLeft className="size-4" />
          Rankings
        </Link>
      </Button>

      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{firm.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {firm.firm_type ? (
                <Badge variant="secondary">{labelFromSnake(firm.firm_type)}</Badge>
              ) : (
                <span>—</span>
              )}
              {firm.headquarters ? <span>{firm.headquarters}</span> : null}
              {firm.founded_year ? (
                <span className="tabular-nums">Est. {firm.founded_year}</span>
              ) : null}
            </div>
          </div>
          {firm.website ? (
            <Button variant="outline" size="sm" asChild>
              <a href={firm.website} target="_blank" rel="noreferrer">
                Website
              </a>
            </Button>
          ) : null}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">AUM</dt>
            <dd className="font-medium tabular-nums">~{formatAumUsd(firm.aum_usd)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last collected</dt>
            <dd>{formatDate(firm.last_collected_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">SEC CRD</dt>
            <dd className="font-mono text-xs">{firm.sec_crd_number ?? '—'}</dd>
          </div>
        </dl>

        {firm.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground text-justify">
            {firm.description}
          </p>
        ) : (
          <EmptyState
            className="py-8"
            icon={Inbox}
            title="No firm description"
            description="Description will appear once collected from sources."
          />
        )}
      </div>
    </div>
  )
}
