import type { FirmType } from './common'
import type { DataSource } from './signal'
import type { RoleCategory } from './common'

export type Person = {
  id: string
  firm_id: string
  full_name: string
  title: string | null
  role_category: RoleCategory
  linkedin_url: string | null
  email: string | null
  bio: string | null
  data_source_id: string | null
  confidence: number
  created_at: string
  updated_at: string
  dataSource?: DataSource | null
  firm?: {
    id: string
    name: string
    slug: string
    firm_type: FirmType | null
  }
}
