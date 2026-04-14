export interface DataSourceMetadataJson {
  query?: string;
  score?: number;
  author?: string;
  path?: string;
  published_date?: string;
  firm_id?: string;
  firm_name?: string;
  seed_source?: string;
}

export interface ScrapeJobMetadataJson {
  target_firm_count?: number;
  firms_created?: number;
  firms_updated?: number;
  firms_enriched?: number;
  firms_in_db?: number;
  rounds?: number;
  total_collected?: number;
  new_sources?: number;
  duplicates_skipped?: number;
  people_created?: number;
  score_version?: string;
  scored?: number;
  failed?: number;
  skipped_reason?: string;
}
