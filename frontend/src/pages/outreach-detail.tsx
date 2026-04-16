import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react'

import {
  getOutreachCampaign,
  updateOutreachCampaign,
  generateCampaignMessage,
} from '@/api/outreach'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import { labelFromSnake } from '@/lib/format'
import { OUTREACH_STATUSES, CONTACT_PLATFORMS, type OutreachStatus } from '@/types/common'
import type { OutreachCampaign } from '@/types/outreach'

export function OutreachDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<OutreachStatus>('not_contacted')
  const [platform, setPlatform] = useState<string | null>(null)
  const [contactedBy, setContactedBy] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [outreachMessage, setOutreachMessage] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [contactedByError, setContactedByError] = useState<string | null>(null)

  const loadCampaign = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const data = await getOutreachCampaign(id, signal)
        setCampaign(data)
        setStatus(data.status)
        setPlatform(data.contact_platform)
        setContactedBy(data.contacted_by)
        setNotes(data.notes)
        setOutreachMessage(data.outreach_message)
      } catch (e) {
        if (signal?.aborted) return
        setError(getErrorMessage(e, 'Failed to load campaign'))
      } finally {
        setLoading(false)
      }
    },
    [id],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadCampaign(controller.signal)
    return () => controller.abort()
  }, [loadCampaign])

  const contactedByLocked = !!campaign?.contacted_by

  const isDirty = useMemo(() => {
    if (!campaign) return false
    return (
      status !== campaign.status ||
      platform !== campaign.contact_platform ||
      (!contactedByLocked && contactedBy !== campaign.contacted_by) ||
      notes !== campaign.notes ||
      outreachMessage !== campaign.outreach_message
    )
  }, [campaign, status, platform, contactedBy, notes, outreachMessage, contactedByLocked])

  const statusChanged = campaign ? status !== campaign.status : false

  const handleSave = useCallback(async () => {
    if (!id || !campaign) return

    if (statusChanged && !contactedBy.trim()) {
      setContactedByError('Analyst name is required before changing the campaign status')
      return
    }
    setContactedByError(null)
    setSaveError(null)
    setSaving(true)

    try {
      const body: Record<string, unknown> = {}
      if (status !== campaign.status) body.status = status
      if (platform !== campaign.contact_platform) body.contact_platform = platform
      if (!contactedByLocked && contactedBy !== campaign.contacted_by)
        body.contacted_by = contactedBy
      if (notes !== campaign.notes) body.notes = notes
      if (outreachMessage !== campaign.outreach_message)
        body.outreach_message = outreachMessage

      const updated = await updateOutreachCampaign(id, body)
      setCampaign(updated)
      setStatus(updated.status)
      setPlatform(updated.contact_platform)
      setContactedBy(updated.contacted_by)
      setNotes(updated.notes)
      setOutreachMessage(updated.outreach_message)
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to save changes'))
    } finally {
      setSaving(false)
    }
  }, [
    id,
    campaign,
    status,
    platform,
    contactedBy,
    notes,
    outreachMessage,
    statusChanged,
    contactedByLocked,
  ])

  const handleGenerate = useCallback(async () => {
    if (!id) return
    setGenerating(true)
    setSaveError(null)
    try {
      const updated = await generateCampaignMessage(id)
      setCampaign(updated)
      setStatus(updated.status)
      setPlatform(updated.contact_platform)
      setContactedBy(updated.contacted_by)
      setNotes(updated.notes)
      setOutreachMessage(updated.outreach_message)
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to generate message'))
    } finally {
      setGenerating(false)
    }
  }, [id])

  if (!id) {
    return <p className="text-sm text-muted-foreground">Missing campaign id.</p>
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
          <Link to="/campaigns">
            <ChevronLeft className="size-4" />
            Back to campaigns
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? 'Campaign not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
          <Link to="/campaigns">
            <ChevronLeft className="size-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Campaign: {campaign.person?.full_name ?? 'Unknown'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {campaign.firm?.name ?? 'Unknown firm'}
            {campaign.person?.title ? ` — ${campaign.person.title}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {campaign.firm && (
          <Link
            to={`/firms/${campaign.firm.id}`}
            className="text-primary hover:underline"
          >
            View firm
          </Link>
        )}
        {campaign.person?.email && <span>Email: {campaign.person.email}</span>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign details</CardTitle>
          <CardDescription>
            {labelFromSnake(campaign.status)} &middot; Created{' '}
            {new Date(campaign.created_at).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as OutreachStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTREACH_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Platform
              </label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Contacted by (analyst)
            </label>
            {contactedByLocked ? (
              <p className="text-sm py-1.5">{contactedBy}</p>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Your name"
                  className={`flex h-8 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    contactedByError
                      ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50'
                      : 'border-input'
                  }`}
                  value={contactedBy}
                  onChange={(e) => {
                    setContactedBy(e.target.value)
                    if (contactedByError && e.target.value.trim()) {
                      setContactedByError(null)
                    }
                  }}
                />
                {contactedByError && (
                  <p className="text-xs text-destructive">{contactedByError}</p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              rows={3}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Internal notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Outreach message
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={generating}
                onClick={handleGenerate}
              >
                {generating ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                {campaign.outreach_message ? 'Re-generate with AI' : 'Generate with AI'}
              </Button>
            </div>
            <textarea
              rows={8}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 leading-relaxed"
              placeholder="Write or generate an outreach message..."
              value={outreachMessage}
              onChange={(e) => setOutreachMessage(e.target.value)}
            />
          </div>

          {saveError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {saveError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button size="sm" disabled={!isDirty || saving} onClick={handleSave}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
