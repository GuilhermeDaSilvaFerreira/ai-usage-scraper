# Data Pipeline

The system operates as a four-stage pipeline. Stages are **automatically chained** so that completing one stage triggers the next. Each stage can also be triggered independently via the REST API for manual re-runs. All stages run asynchronously via BullMQ queues.

```mermaid
flowchart LR
    SEED[Stage 1\nSeeding] --> COLLECT[Stage 2\nCollection]
    COLLECT --> EXTRACT[Stage 3\nExtraction]
    EXTRACT --> SCORE[Stage 4\nScoring]
```

## Stage Overview

| Stage | Name           | Purpose |
| ----- | -------------- | ------- |
| 1     | **Seeding**    | Build the firm universe from SEC filings, semantic web search, and public rankings. Deduplicates via entity resolution. |
| 2     | **Collection** | Gather raw evidence: a **signal pipeline** (news, hiring, conferences, website, LinkedIn) feeding extraction, and a **people pipeline** (LinkedIn profiles, team pages) writing directly to the `people` table. |
| 3     | **Extraction** | Turn raw text into structured signals via a layered cascade (regex → NLP → heuristics → LLM fallback). The LLM is only invoked when cheaper layers fail. |
| 4     | **Scoring**    | Score six weighted dimensions (talent, activity, hiring velocity, thought leadership, vendors, portfolio strategy) producing a 0–100 overall score with a full evidence chain. |

---

## Stage 1 — Firm Universe Seeding

**Queue:** `seeding` (concurrency: 3)

Seeds the database with PE and private credit firms from three sources running in parallel. The job runs up to **5 rounds** until the DB reaches the `target_firm_count` or two consecutive rounds yield zero new firms.

```mermaid
flowchart TB
    subgraph sources [Data Sources]
        SEC[SEC EDGAR\nForm ADV filings]
        EXA[Exa Semantic Search\n10 targeted queries]
        PUB[Public Rankings\nWikipedia + well-known firms]
    end

    subgraph resolution [Entity Resolution]
        NORM[Name Normalization\nStrip LLC, LP, suffixes]
        LEV[Levenshtein Distance\nThreshold ≤ 15%]
        DOM[Domain Matching\nWebsite comparison]
        MERGE[Merge Duplicates]
    end

    sources --> NORM --> LEV --> DOM --> MERGE
    MERGE --> DB[(firms + firm_aliases)]
    DB --> ENRICH[FirmEnrichmentService\nBackfill website, CRD, description]
```

### Entity Resolution

The `EntityResolutionService` deduplicates candidates using three strategies applied in order:

1. **Exact match** on normalized name (lowercase, suffixes stripped).
2. **Domain match** — if two candidates share the same website domain, they are the same firm.
3. **Fuzzy match** — Levenshtein distance relative to name length, with a 15% threshold.

When merging, the service keeps the most complete data: largest AUM, first non-null website, first non-null firm type, etc. All original name variants are stored as `firm_aliases` for future matching.

### Diversified Selection

Source quotas ensure a balanced firm universe: ~30% SEC, ~30% Exa, ~40% public rankings, then backfill by AUM.

### Post-Seeding Enrichment

After seeding, `FirmEnrichmentService.enrichFirmsWithGaps` runs automatically to backfill missing data (website via Exa, CRD/CIK via SEC EDGAR, descriptions via website crawl).

---

## Stage 2 — Collection

**Queues:** `signal-collection` and `people-collection` (concurrency: 10 each, lock duration: 5 min)

Creates **two BullMQ jobs per firm**, processed in parallel on separate queues:

```mermaid
flowchart TB
    FIRM[Firm Record] --> SQ[signal-collection queue]
    FIRM --> PQ[people-collection queue]

    subgraph signal_pipeline [Signal Pipeline]
        SQ --> NC[News Collector]
        SQ --> HC[Hiring Collector]
        SQ --> CC[Conference Collector]
        SQ --> WC[Website Collector]
        SQ --> LS[LinkedIn Signal Collector]

        NC & HC & CC & WC & LS --> SDEDUP{Content hash\nexists?}
        SDEDUP -->|No| SDS[(data_sources)]
        SDEDUP -->|Yes| SKIP1[Skip]
        SDS --> EQ[extraction queue]
    end

    subgraph people_pipeline [People Pipeline]
        PQ --> LP[LinkedIn People Collector]
        PQ --> WP[Website Team Collector]

        LP & WP --> PDEDUP{Content hash\nexists?}
        PDEDUP -->|No| PDS[(data_sources)]
        PDEDUP -->|Yes| SKIP2[Skip]
        PDS --> PARSE[Parse People]
        PARSE --> PEOPLE[(people table)]
    end
```

### Signal Collectors

| Collector | Method | What it finds | Lookback |
| --------- | ------ | ------------- | -------- |
| News | Exa semantic search (category: news) | AI-related news mentions | 1 year |
| Hiring | Exa search + site-scoped if website known | Data/ML/AI job postings | 6 months |
| Conference | Exa semantic search | Conference talks, podcasts, thought leadership | 2 years |
| Website | Direct HTTP (Axios + Cheerio) on 6 paths | `/`, `/about`, `/technology`, `/data`, `/innovation`, `/portfolio` | Current |
| LinkedIn Signals | Exa search scoped to linkedin.com | AI adoption posts, ML/GenAI mentions | 1 year |

### People Collectors

| Collector | Method | What it finds |
| --------- | ------ | ------------- |
| LinkedIn People | Exa search scoped to linkedin.com | CDO, CTO, Head of Data/AI, VP Technology profiles |
| Website Team | Direct HTTP on 4 paths (`/team`, `/people`, `/leadership`, `/about/team`) | Team page bios parsed via regex |

People are parsed in-process (no separate extraction queue) and written directly to the `people` table with inferred role categories (`head_of_data`, `head_of_tech`, `operating_partner`, `ai_hire`, `other`).

### Idempotency

Every collected document is hashed with SHA-256. Before saving, the hash is checked against existing `data_sources` records. Duplicates are silently skipped. Re-running collection is safe.

### Rate Limiting

All external calls go through per-source token-bucket rate limiters:

| Source | Max Concurrent | Delay Between Requests |
| ------ | -------------- | ---------------------- |
| Exa API | 2 | 500ms |
| SEC EDGAR | 1 | 1200ms |
| General Web | 3 | 1000ms |

### Reliability Scoring

Each `data_sources` record receives a reliability score based on domain:

| Domain Pattern | Score |
| -------------- | ----- |
| `.gov` (SEC, government) | 0.95 |
| Bloomberg, Reuters, WSJ, FT | 0.90 |
| TechCrunch, Business Insider | 0.75 |
| LinkedIn | 0.70 |
| Other | 0.50 |

---

## Stage 3 — Extraction

**Queue:** `extraction` (concurrency: 10, lock duration: 5 min)

**Trigger:** Automatic — each new `data_sources` row created during signal collection enqueues an extraction job.

The extraction pipeline is layered. Each layer runs only if previous layers did not produce sufficient high-confidence results. The confidence threshold is configurable via `EXTRACTION_CONFIDENCE_THRESHOLD` (default: `0.5`).

```mermaid
flowchart TD
    INPUT[Raw Content] --> REGEX[Regex Extractor]
    REGEX --> CHECK1{High confidence\nresults?}
    CHECK1 -->|All above threshold| SAVE1[Save signals]
    CHECK1 -->|Some low or none| NLP[NLP Extractor]

    NLP --> CHECK2{High confidence\nresults?}
    CHECK2 -->|All above threshold| SAVE2[Save signals]
    CHECK2 -->|Some low or none| HEUR[Heuristic Extractor]

    HEUR --> CHECK3{Any high-conf\nresults across\nall layers?}
    CHECK3 -->|Yes| SAVE3[Save signals]
    CHECK3 -->|Zero high-conf| LLM[LLM Fallback\nAnthropic / OpenAI]

    LLM --> SAVE4[Save signals]

    SAVE1 & SAVE2 & SAVE3 & SAVE4 --> DEDUP[Deduplicate\nby signal type + data]
    DEDUP --> DB[(firm_signals)]
```

### Extractor Layers

| Layer | Confidence Range | Approach |
| ----- | ---------------- | -------- |
| **Regex** | 0.80 – 0.90 | Pattern-matching for structured data: executive hires, vendor partnerships, AUM mentions, job postings, conference appearances, portfolio AI strategy |
| **NLP** | 0.50 – 0.80 | `compromise` library: AI keyword density (20+ terms), people in AI-related sentences, sentence intent classification |
| **Heuristic** | 0.50 – 0.85 | Rule-based keyword bundles for leadership roles, operating partner mandates, portfolio + AI combinations, tech stack mentions |
| **LLM** | capped at 0.85 | Structured JSON extraction via Anthropic (default) or OpenAI. Only invoked when **all prior layers produce zero high-confidence results**. Temperature 0.1, input truncated to 8,000 chars. |

The LLM provider is configurable via `LLM_PROVIDER` env var (`anthropic` by default, `openai` as alternative).

---

## Stage 4 — Scoring

**Queue:** `scoring` (concurrency: 5)

The scoring engine is pure TypeScript with no LLM involvement. It reads all `firm_signals` for a firm and passes them through six independent dimension scorers.

```mermaid
flowchart TB
    SIGNALS[(firm_signals)] --> ENGINE[ScoringEngine]

    ENGINE --> D1[AI Talent Density\n25%]
    ENGINE --> D2[Public AI Activity\n20%]
    ENGINE --> D3[AI Hiring Velocity\n20%]
    ENGINE --> D4[Thought Leadership\n15%]
    ENGINE --> D5[Vendor Partnerships\n10%]
    ENGINE --> D6[Portfolio AI Strategy\n10%]

    D1 & D2 & D3 & D4 & D5 & D6 --> AGG[Weighted Sum → 0-100]
    AGG --> SCORE[(firm_scores)]
    AGG --> EVIDENCE[(score_evidence)]
    SCORE --> RANK[Compute Ranks]
```

### Scoring Dimensions

Each dimension scores 0–100 internally, then the weighted sum produces the overall score.

| Dimension | Weight | Signal Types | Scoring Logic |
| --------- | ------ | ------------ | ------------- |
| AI Talent Density | 25% | `ai_team_growth`, `ai_hiring` | Senior hires (15 pts, cap 45), team growth (10 pts, cap 30), general hires (5 pts, cap 25) |
| Public AI Activity | 20% | `ai_news_mention`, `ai_case_study`, `linkedin_ai_activity` | News (8 pts, cap 40), case studies (15 pts, cap 35), LinkedIn (5 pts, cap 25) |
| AI Hiring Velocity | 20% | `ai_hiring` | Recent 6mo (12 pts, cap 50), older (5 pts, cap 25), role diversity bonus (5 pts/role, cap 25) |
| Thought Leadership | 15% | `ai_conference_talk`, `ai_podcast`, `ai_research` | Conferences (15 pts, cap 40), podcasts (12 pts, cap 30), research (15 pts, cap 30) |
| Vendor Partnerships | 10% | `ai_vendor_partnership`, `tech_stack_signal` | Unique vendors (20 pts, cap 60), tech stack (10 pts, cap 40) |
| Portfolio AI Strategy | 10% | `portfolio_ai_initiative`, `ai_case_study` | Portfolio initiatives (20 pts, cap 60), portfolio case studies (15 pts, cap 40) |

### Evidence Chain

Every point contributed to a score is recorded in `score_evidence`, linking the `firm_score` to the specific `firm_signal` that produced it, along with the dimension, weight applied, points contributed, and a human-readable reasoning string.

### Score Versioning and Re-scoring

Scoring runs are tagged with a `version` string (e.g. `v1.0`, `v2.0-talent-heavy`). Weights and thresholds are fully configurable per run. To A/B test scoring:

1. Call the re-score endpoint with a new version string and different weights.
2. The engine replays all existing `firm_signals` through the new config (no re-scraping).
3. New `firm_scores` rows are created with the new version tag. Rankings are recomputed.
4. Compare versions side by side via the rankings or firm scores endpoints.

---

## Queue Architecture

```mermaid
flowchart LR
    CRON["Cron Job\n(weekly)"] -->|auto| SDQ
    API1["/api/pipeline/seed"] --> SDQ["seeding\n(concurrency: 3)"]
    SDQ -->|"auto-chain"| SCQ
    API2["/api/pipeline/collect"] --> SCQ["signal-collection\n(concurrency: 10)"]
    API2 --> PCQ["people-collection\n(concurrency: 10)"]
    SCQ --> EXQ["extraction\n(concurrency: 10)"]
    EXQ -->|"auto-chain\n(per firm)"| SCRQ
    API3["/api/pipeline/score"] --> SCRQ["scoring\n(concurrency: 5)"]

    SDQ -->|"auto-chain"| PCQ
    PCQ --> PEOPLE[(people)]
    EXQ --> SIGNALS[(firm_signals)]
    SCRQ --> SCORES[(firm_scores)]
```

| Queue | Concurrency | Retry | Purpose |
| ----- | ----------- | ----- | ------- |
| `seeding` | 3 | 1 attempt | Discover and persist firms |
| `signal-collection` | 10 | 3 attempts, exponential backoff 5s | Collect AI evidence per firm |
| `people-collection` | 10 | 3 attempts, exponential backoff 5s | Collect AI-relevant people per firm |
| `extraction` | 10 | — | Extract structured signals from raw content |
| `scoring` | 5 | — | Score firms across six dimensions |

---

## Full Pipeline Sequence (Automated)

The full pipeline can be triggered by a single API call (`POST /pipeline/seed`) or by the weekly cron job. Each stage automatically chains to the next via the `PipelineOrchestratorService`. Manual endpoints remain available for re-triggering individual stages.

```mermaid
sequenceDiagram
    participant Cron as Cron / User
    participant API
    participant Orch as Orchestrator
    participant Redis as Redis / BullMQ
    participant DB as PostgreSQL
    participant Exa as Exa API
    participant SEC as SEC EDGAR
    participant LLM as Anthropic / OpenAI

    Cron->>API: POST /pipeline/seed (or cron trigger)
    API->>Redis: Enqueue seeding job
    API-->>Cron: { job_id }

    loop Up to 5 rounds
        Redis->>SEC: Search Form ADV filings
        Redis->>Exa: Semantic search for PE firms
        Redis->>DB: Deduplicate & insert firms
    end
    Redis->>Exa: Enrich firms with gaps
    Redis->>DB: Update firm data

    Note over Orch: Seeding complete — auto-chain
    Orch->>Redis: Enqueue N signal + N people jobs

    par Signal collection (per firm)
        Redis->>Exa: News, hiring, conference queries
        Redis->>DB: Save data_sources (deduplicated)
        Redis->>Redis: Enqueue extraction jobs
        Orch->>Redis: Track pending extractions (counter)
    and People collection (per firm)
        Redis->>Exa: LinkedIn leadership queries
        Redis->>DB: Save people directly
    end

    par Extraction (per data_source)
        Redis->>Redis: Regex → NLP → Heuristic
        alt Zero high-confidence results
            Redis->>LLM: Structured extraction
        end
        Redis->>DB: Save firm_signals
        Orch->>Redis: Decrement extraction counter
    end

    Note over Orch: All extractions for firm done (counter = 0)
    Orch->>Redis: Enqueue scoring job for firm

    Redis->>DB: Read firm_signals
    Redis->>DB: Write firm_scores + score_evidence
    Redis->>DB: Compute ranks

    Cron->>API: GET /rankings
    API->>DB: Query firm_scores ORDER BY rank
    API-->>Cron: Ranked firm list
```

## Manual Endpoints (still available)

All original endpoints remain functional for manual re-triggers:

| Endpoint | Use case |
| -------- | -------- |
| `POST /api/pipeline/seed` | Re-run seeding (auto-chains to collection if enabled) |
| `POST /api/pipeline/collect` | Re-collect all firms (auto-chains to scoring per firm) |
| `POST /api/pipeline/:firm_id/collect` | Re-collect a single firm |
| `POST /api/pipeline/score` | Re-score all firms |
| `POST /api/pipeline/rescore` | Re-score with new weights (no re-collection) |
| `GET /api/pipeline/status` | Queue health and recent jobs |

---

## Automated Pipeline Chaining

The `PipelineOrchestratorService` automatically chains stages so that completing one triggers the next. This is enabled by default and controlled via the `PIPELINE_AUTO_CHAIN` env var.

### Chain 1: Seeding → Collection

After the seeding processor finishes (firms discovered + enriched), the orchestrator queries all active firms that haven't been collected in the last 24 hours and enqueues `signal-collection` + `people-collection` jobs for each.

### Chain 2: Collection → Extraction (pre-existing)

Signal collection already enqueues extraction jobs inline for each new `data_sources` row. No additional wiring was needed.

### Chain 3: Extraction → Scoring (per firm)

When collection enqueues extraction jobs for a firm, it also sets an atomic Redis counter (`pipeline:firm:{firmId}:pending_extractions`). Each extraction processor decrements the counter on completion (success or failure). When the counter reaches zero, the orchestrator enqueues a scoring job for that firm.

If collection produces zero new data sources for a firm (all content was deduplicated), the orchestrator checks whether the firm has existing signals and triggers scoring directly.

### Reliability

- **Counter TTL**: Redis keys expire after 24 hours to prevent stuck counters from crashes.
- **Failure handling**: Extraction failures still decrement the counter, so scoring triggers with whatever signals were successfully extracted.
- **Deduplication**: Before enqueuing a scoring job, the orchestrator checks if one is already waiting/active for the same firm.
- **Toggle**: Set `PIPELINE_AUTO_CHAIN=false` to disable all chaining and revert to fully manual operation.

---

## Scheduled Execution

The `PipelineCronService` runs the full pipeline on a configurable schedule using `@nestjs/schedule`. When the cron fires, it enqueues a seeding job which auto-chains through the entire pipeline.

### Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PIPELINE_CRON_SCHEDULE` | `0 0 * * 0` (Sunday midnight) | Cron expression for the scheduled pipeline run |
| `PIPELINE_SEED_TARGET` | `50` | Target number of firms in the DB for seeding |
| `PIPELINE_AUTO_CHAIN` | `true` | Enable/disable automatic stage chaining |

The schedule is registered dynamically at startup via `SchedulerRegistry`, so it reads the env var at boot time. To change the schedule, update the env var and restart the application.
