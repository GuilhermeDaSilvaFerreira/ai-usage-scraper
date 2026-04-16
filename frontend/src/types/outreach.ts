import type { OutreachStatus, ContactPlatform } from './common'

export type OutreachCampaign = {
  id: string
  firm_id: string
  person_id: string
  status: OutreachStatus
  contact_platform: ContactPlatform | null
  contacted_by: string | null
  notes: string | null
  outreach_message: string | null
  first_contact_at: string | null
  last_status_change_at: string | null
  created_at: string
  updated_at: string
  firm?: {
    id: string
    name: string
    slug: string
  }
  person?: {
    id: string
    full_name: string
    title: string | null
    email: string | null
  }
}

export type OutreachStats = Record<OutreachStatus, number>
