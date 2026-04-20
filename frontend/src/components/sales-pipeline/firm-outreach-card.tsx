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
      <FirmOutreachCardHeader />
      <CardContent>
        {error ? <ErrorBanner message={error} /> : null}

        {!loading && campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns"
            description="Campaigns will appear once this firm has been scored."
          />
        ) : (
          <CampaignsTable campaigns={campaigns} />
        )}
      </CardContent>
    </Card>
  )
}

function FirmOutreachCardHeader() {
  return (
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
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}

function CampaignsTable({ campaigns }: { campaigns: OutreachCampaign[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Person</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 pr-3 font-medium">Platforms</th>
            <th className="pb-2 pr-3 font-medium">Contacted by</th>
            <th className="pb-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: OutreachCampaign }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3">
        <Link
          to={`/campaigns/${campaign.id}`}
          className="text-primary hover:underline underline-offset-4"
        >
          {campaign.person?.full_name ?? '—'}
        </Link>
      </td>
      <td className="py-2 pr-3">
        <OutreachStatusBadge status={campaign.status} />
      </td>
      <td className="py-2 pr-3">{formatPlatforms(campaign.contact_platforms)}</td>
      <td className="py-2 pr-3">{campaign.contacted_by ?? '—'}</td>
      <td className="py-2">{formatDate(campaign.first_contact_at)}</td>
    </tr>
  )
}

function formatPlatforms(platforms: OutreachCampaign['contact_platforms']) {
  if (!platforms || platforms.length === 0) return '—'
  return platforms.map((p) => labelFromSnake(p)).join(', ')
}
