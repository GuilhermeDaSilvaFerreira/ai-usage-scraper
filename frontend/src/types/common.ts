export type FirmType =
  | 'buyout'
  | 'growth'
  | 'credit'
  | 'direct_lending'
  | 'distressed'
  | 'mezzanine'
  | 'secondaries'
  | 'multi_strategy'

export type RoleCategory =
  | 'head_of_data'
  | 'head_of_tech'
  | 'ai_hire'
  | 'operating_partner'
  | 'speaker'
  | 'other'

export type SourceType =
  | 'sec_edgar'
  | 'exa_search'
  | 'news'
  | 'linkedin'
  | 'conference'
  | 'podcast'
  | 'vendor_partnership'
  | 'firm_website'
  | 'hiring_board'
  | 'public_ranking'

export type DataSourceTarget = 'firms' | 'firm_signals' | 'people'

export type SignalType =
  | 'ai_hiring'
  | 'ai_news_mention'
  | 'ai_conference_talk'
  | 'ai_vendor_partnership'
  | 'ai_case_study'
  | 'ai_podcast'
  | 'ai_research'
  | 'linkedin_ai_activity'
  | 'tech_stack_signal'
  | 'ai_team_growth'
  | 'portfolio_ai_initiative'

export type ExtractionMethod = 'regex' | 'nlp' | 'heuristic' | 'llm'

export type JobType =
  | 'seed'
  | 'collect'
  | 'collect_people'
  | 'collect_signals'
  | 'extract'
  | 'score'

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export const FIRM_TYPES: { value: FirmType; label: string }[] = [
  { value: 'buyout', label: 'Buyout' },
  { value: 'growth', label: 'Growth' },
  { value: 'credit', label: 'Credit' },
  { value: 'direct_lending', label: 'Direct lending' },
  { value: 'distressed', label: 'Distressed' },
  { value: 'mezzanine', label: 'Mezzanine' },
  { value: 'secondaries', label: 'Secondaries' },
  { value: 'multi_strategy', label: 'Multi-strategy' },
]
