import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ExternalLink, Loader2, Mail, Sparkles, User, X } from 'lucide-react'

import {
  getOutreachCampaign,
  updateOutreachCampaign,
  generateCampaignMessage,
} from '@/api/outreach'
import { Badge } from '@/components/ui/badge'
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
import {
  OUTREACH_STATUSES,
  CONTACT_PLATFORMS,
  type ContactPlatform,
  type OutreachStatus,
} from '@/types/common'
import type { OutreachCampaign } from '@/types/outreach'

function arraysEqualUnordered<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  for (const item of b) if (!setA.has(item)) return false
  return true
}

export function OutreachDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<OutreachStatus>('not_contacted')
  const [platforms, setPlatforms] = useState<ContactPlatform[]>([])
  const [contactedBy, setContactedBy] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [outreachMessage, setOutreachMessage] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [contactedByError, setContactedByError] = useState<string | null>(null)

  const applyCampaign = useCallback((data: OutreachCampaign) => {
    setCampaign(data)
    setStatus(data.status)
    setPlatforms(data.contact_platforms ?? [])
    setContactedBy(data.contacted_by)
    setNotes(data.notes)
    setOutreachMessage(data.outreach_message)
  }, [])

  const loadCampaign = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const data = await getOutreachCampaign(id, signal)
        applyCampaign(data)
      } catch (e) {
        if (signal?.aborted) return
        setError(getErrorMessage(e, 'Failed to load campaign'))
      } finally {
        setLoading(false)
      }
    },
    [id, applyCampaign],
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
      !arraysEqualUnordered(platforms, campaign.contact_platforms ?? []) ||
      (!contactedByLocked && contactedBy !== campaign.contacted_by) ||
      notes !== campaign.notes ||
      outreachMessage !== campaign.outreach_message
    )
  }, [
    campaign,
    status,
    platforms,
    contactedBy,
    notes,
    outreachMessage,
    contactedByLocked,
  ])

  const statusChanged = campaign ? status !== campaign.status : false

  const togglePlatform = useCallback((value: ContactPlatform) => {
    setPlatforms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    )
  }, [])

  const removePlatform = useCallback((value: ContactPlatform) => {
    setPlatforms((prev) => prev.filter((p) => p !== value))
  }, [])

  const handleSave = useCallback(async () => {
    if (!id || !campaign) return

    if (statusChanged && !contactedBy?.trim()) {
      setContactedByError('Analyst name is required before changing the campaign status')
      return
    }
    setContactedByError(null)
    setSaveError(null)
    setSaving(true)

    try {
      const body: Record<string, unknown> = {}
      if (status !== campaign.status) body.status = status
      if (!arraysEqualUnordered(platforms, campaign.contact_platforms ?? [])) {
        body.contact_platforms = platforms
      }
      if (!contactedByLocked && contactedBy !== campaign.contacted_by)
        body.contacted_by = contactedBy
      if (notes !== campaign.notes) body.notes = notes
      if (outreachMessage !== campaign.outreach_message)
        body.outreach_message = outreachMessage

      const updated = await updateOutreachCampaign(id, body)
      applyCampaign(updated)
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to save changes'))
    } finally {
      setSaving(false)
    }
  }, [
    id,
    campaign,
    status,
    platforms,
    contactedBy,
    notes,
    outreachMessage,
    statusChanged,
    contactedByLocked,
    applyCampaign,
  ])

  const handleGenerate = useCallback(async () => {
    if (!id) return
    setGenerating(true)
    setSaveError(null)
    try {
      const updated = await generateCampaignMessage(id)
      applyCampaign(updated)
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to generate message'))
    } finally {
      setGenerating(false)
    }
  }, [id, applyCampaign])

  if (!id) {
    return <p className="text-sm text-muted-foreground">Missing campaign id.</p>
  }

  if (loading) {
    return <LoadingState />
  }

  if (error || !campaign) {
    return <ErrorState message={error ?? 'Campaign not found.'} />
  }

  return (
    <div className="space-y-6">
      <CampaignHeader campaign={campaign} />
      <CampaignSummaryLinks campaign={campaign} />

      <ContactInfoCard person={campaign.person} />

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
            <StatusField value={status} onChange={setStatus} />
            <PlatformsField
              platforms={platforms}
              onAdd={togglePlatform}
              onRemove={removePlatform}
            />
          </div>

          <ContactedByField
            value={contactedBy}
            locked={contactedByLocked}
            error={contactedByError}
            onChange={(v) => {
              setContactedBy(v)
              if (contactedByError && v.trim()) setContactedByError(null)
            }}
          />

          <NotesField value={notes} onChange={setNotes} />

          <OutreachMessageField
            value={outreachMessage}
            generating={generating}
            hasExistingMessage={!!campaign.outreach_message}
            onChange={setOutreachMessage}
            onGenerate={handleGenerate}
          />

          {saveError ? <SaveErrorBanner message={saveError} /> : null}

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

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <BackToCampaignsLink />
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {message}
      </div>
    </div>
  )
}

function BackToCampaignsLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
      <Link to="/campaigns">
        <ChevronLeft className="size-4" />
        Campaigns
      </Link>
    </Button>
  )
}

function CampaignHeader({ campaign }: { campaign: OutreachCampaign }) {
  return (
    <div className="space-y-4">
      <BackToCampaignsLink />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Campaign: {campaign.person?.full_name ?? 'Unknown'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {campaign.firm?.name ?? 'Unknown firm'}
          {campaign.person?.title ? ` — ${campaign.person.title}` : ''}
        </p>
      </div>
    </div>
  )
}

function CampaignSummaryLinks({ campaign }: { campaign: OutreachCampaign }) {
  if (!campaign.firm) return null
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <Link to={`/firms/${campaign.firm.id}`} className="text-primary hover:underline">
        View firm
      </Link>
    </div>
  )
}

function ContactInfoCard({ person }: { person: OutreachCampaign['person'] }) {
  const linkedinUrl = person?.linkedin_url ?? null
  const email = person?.email ?? null
  const bio = person?.bio ?? null
  const hasAny = !!(linkedinUrl || email || bio)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4 text-muted-foreground" />
          Contact info
        </CardTitle>
        <CardDescription>
          Reach out using the channels collected for this person.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAny ? (
          <>
            <ContactField label="LinkedIn" icon={ExternalLink}>
              {linkedinUrl ? (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {linkedinUrl}
                </a>
              ) : (
                <EmptyValue label="No LinkedIn URL on file" />
              )}
            </ContactField>

            <ContactField label="Email" icon={Mail}>
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="text-primary hover:underline break-all"
                >
                  {email}
                </a>
              ) : (
                <EmptyValue label="No email on file" />
              )}
            </ContactField>

            <ContactField label="Bio">
              {bio ? (
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {bio}
                </p>
              ) : (
                <EmptyValue label="No bio on file" />
              )}
            </ContactField>
          </>
        ) : (
          <EmptyValue label="No contact information on file for this person." />
        )}
      </CardContent>
    </Card>
  )
}

function ContactField({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: typeof Mail
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function EmptyValue({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground italic">{label}</p>
}

function StatusField({
  value,
  onChange,
}: {
  value: OutreachStatus
  onChange: (value: OutreachStatus) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Status</label>
      <Select value={value} onValueChange={(v) => onChange(v as OutreachStatus)}>
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
  )
}

function PlatformsField({
  platforms,
  onAdd,
  onRemove,
}: {
  platforms: ContactPlatform[]
  onAdd: (value: ContactPlatform) => void
  onRemove: (value: ContactPlatform) => void
}) {
  const availableToAdd = CONTACT_PLATFORMS.filter((p) => !platforms.includes(p.value))

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Platforms</label>
      <SelectedPlatformsList platforms={platforms} onRemove={onRemove} />
      {availableToAdd.length > 0 ? (
        <Select value="" onValueChange={(v) => onAdd(v as ContactPlatform)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Add a platform..." />
          </SelectTrigger>
          <SelectContent>
            {availableToAdd.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">All platforms selected.</p>
      )}
    </div>
  )
}

function SelectedPlatformsList({
  platforms,
  onRemove,
}: {
  platforms: ContactPlatform[]
  onRemove: (value: ContactPlatform) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-input bg-transparent px-2 py-1.5 min-h-9">
      {platforms.length === 0 ? (
        <span className="text-sm text-muted-foreground px-1">No platforms selected</span>
      ) : (
        platforms.map((p) => (
          <Badge key={p} variant="secondary" className="gap-1 pr-1">
            {labelFromSnake(p)}
            <button
              type="button"
              aria-label={`Remove ${labelFromSnake(p)}`}
              className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
              onClick={() => onRemove(p)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))
      )}
    </div>
  )
}

function ContactedByField({
  value,
  locked,
  error,
  onChange,
}: {
  value: string | null
  locked: boolean
  error: string | null
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Contacted by (analyst)
      </label>
      {locked ? (
        <p className="text-sm py-1.5">{value}</p>
      ) : (
        <>
          <input
            type="text"
            placeholder="Your name"
            className={`flex h-8 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
              error
                ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50'
                : 'border-input'
            }`}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}

function NotesField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Notes</label>
      <textarea
        rows={3}
        className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        placeholder="Internal notes..."
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function OutreachMessageField({
  value,
  generating,
  hasExistingMessage,
  onChange,
  onGenerate,
}: {
  value: string | null
  generating: boolean
  hasExistingMessage: boolean
  onChange: (value: string) => void
  onGenerate: () => void
}) {
  return (
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
          onClick={onGenerate}
        >
          {generating ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5 mr-1.5" />
          )}
          {hasExistingMessage ? 'Re-generate with AI' : 'Generate with AI'}
        </Button>
      </div>
      <textarea
        rows={8}
        disabled={generating}
        className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 leading-relaxed disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={
          generating
            ? 'Generating message with AI...'
            : 'Write or generate an outreach message...'
        }
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function SaveErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}
