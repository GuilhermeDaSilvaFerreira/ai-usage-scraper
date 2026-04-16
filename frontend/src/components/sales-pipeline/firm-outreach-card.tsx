import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone } from 'lucide-react'

import { getOutreachByFirm } from '@/api/outreach'
import { EmptyState } from '@/components/empty-state'
import { OutreachStatusBadge } from '@/components/sales-pipeline/outreach-status-badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatDate, labelFromSnake } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import type { OutreachCampaign } from '@/types/outreach'

type Props = {
  firmId: string
}

export function FirmOutreachCard({ firmId }: Props) {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getOutreachByFirm(firmId)
      setCampaigns(data)
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load campaigns'))
    } finally {
      setLoading(false)
    }
  }, [firmId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-5 text-muted-foreground" />
          Outreach campaigns
        </CardTitle>
        <CardDescription>
          Sales outreach tracking for this firm. Campaigns are created automatically after
          scoring.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns"
            description="Campaigns will appear once this firm has been scored."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Person</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Platform</th>
                  <th className="pb-2 pr-3 font-medium">Contacted by</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/campaigns/${c.id}`}
                        className="text-primary hover:underline underline-offset-4"
                      >
                        {c.person?.full_name ?? '—'}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <OutreachStatusBadge status={c.status} />
                    </td>
                    <td className="py-2 pr-3">
                      {c.contact_platform ? labelFromSnake(c.contact_platform) : '—'}
                    </td>
                    <td className="py-2 pr-3">{c.contacted_by ?? '—'}</td>
                    <td className="py-2">{formatDate(c.first_contact_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
