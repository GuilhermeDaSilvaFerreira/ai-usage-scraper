import type { DataSourceTarget, ExtractionMethod, SignalType, SourceType } from './common'

export type DataSourceMetadataJson = {
  query?: string
  score?: number
  author?: string
  path?: string
  published_date?: string
  firm_id?: string
  firm_name?: string
  seed_source?: string
}

export type DataSource = {
  id: string
  source_type: SourceType
  target_entity: DataSourceTarget
  url: string | null
  title: string | null
  retrieved_at: string
  raw_content_hash: string | null
  content_snippet: string | null
  reliability_score: number
  metadata: DataSourceMetadataJson | null
  created_at: string
}

export type SignalDataJson = {
  firm_name?: string
  person_name?: string
  title?: string
  role?: string
  job_title?: string
  job_role?: string
  vendor_name?: string
  aum_mention?: string
  source?: string
  description?: string
  event?: string
  context?: string
  type?: string
  matched_terms?: string[]
  sentence?: string
  ai_keyword_density?: number
  ai_keyword_count?: number
  url?: string
  llm_reasoning?: string
  [key: string]: unknown
}

export type FirmSignal = {
  id: string
  firm_id: string
  signal_type: SignalType
  signal_data: SignalDataJson
  data_source_id: string | null
  collected_at: string
  extraction_method: ExtractionMethod
  extraction_confidence: number
  data_source?: DataSource | null
}
