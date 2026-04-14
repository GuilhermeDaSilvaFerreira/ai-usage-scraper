import type { FirmType } from './common'
import type { DataSource } from './signal'
import type { FirmScore } from './score'
import type { Person } from './person'

export type FirmAlias = {
  id: string
  firm_id: string
  alias_name: string
  source: string | null
  created_at: string
}

export type Firm = {
  id: string
  name: string
  slug: string
  website: string | null
  aum_usd: number | null
  aum_source: string | null
  firm_type: FirmType | null
  headquarters: string | null
  founded_year: number | null
  description: string | null
  sec_crd_number: string | null
  is_active: boolean
  last_collected_at: string | null
  data_source_id: string | null
  dataSource?: DataSource | null
  created_at: string
  updated_at: string
  aliases?: FirmAlias[]
  people?: Person[]
}

export type FirmDetail = Firm & {
  latest_score: FirmScore | null
}
