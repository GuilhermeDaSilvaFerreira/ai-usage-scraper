# Architecture

## Overview

The PE AI Intelligence system is a NestJS backend that discovers, scores, and ranks PE and private credit firms by their AI adoption maturity. It operates as a four-stage data pipeline backed by PostgreSQL for persistence and BullMQ (Redis) for asynchronous job processing.

Every score is explainable: a user can drill into any firm's score and trace it back through dimension breakdowns, individual signal evidence, extraction method, and the original public source URL.

```mermaid
flowchart TB
    subgraph external [External Sources]
        SEC[SEC EDGAR]
        EXA[Exa Semantic Search]
        PUB[Public Rankings]
        WEB[Firm Websites]
        LI[LinkedIn]
    end

    subgraph app [NestJS Application]
        subgraph stage1 [Stage 1 - Seeding]
            S1[SecEdgarSource]
            S2[ExaSearchSource]
            S3[PublicRankingsSource]
            ER[EntityResolutionService]
        end

        subgraph stage2 [Stage 2 - Signal Collection]
            CQ[BullMQ: signal-collection]
            NC[NewsCollector]
            HC[HiringCollector]
            CC[ConferenceCollector]
            WC[WebsiteCollector]
            LC[LinkedInCollector]
        end

        subgraph stage2b [Stage 2 - People Collection]
            PQ[BullMQ: people-collection]
            LPC[LinkedIn People Collector]
            WPC[Website Team Collector]
        end

        subgraph stage3 [Stage 3 - Extraction]
            EQ[BullMQ: extraction]
            RE[RegexExtractor]
            NE[NlpExtractor]
            HE[HeuristicExtractor]
            LE[LlmExtractor]
        end

        subgraph stage4 [Stage 4 - Scoring]
            SQ[BullMQ: scoring]
            SE[ScoringEngine]
            D1[AiTalentDimension]
            D2[PublicActivityDimension]
            D3[HiringSignalsDimension]
            D4[ThoughtLeadershipDimension]
            D5[VendorPartnershipsDimension]
            D6[PortfolioStrategyDimension]
        end

        API[REST API]
    end

    DB[(PostgreSQL)]
    REDIS[(Redis)]

    SEC --> S1
    EXA --> S2
    PUB --> S3
    S1 & S2 & S3 --> ER --> DB

    DB --> CQ --> NC & HC & CC & WC & LC
    DB --> PQ --> LPC & WPC
    WEB --> WC
    WEB --> WPC
    LI --> LC
    LI --> LPC
    NC & HC & CC & WC & LC --> EQ
    LPC & WPC --> DB
    EQ --> RE --> NE --> HE
    HE -->|"confidence < threshold"| LE
    RE & NE & HE & LE --> DB

    DB --> SQ --> SE
    SE --> D1 & D2 & D3 & D4 & D5 & D6
    D1 & D2 & D3 & D4 & D5 & D6 --> DB

    DB --> API
    CQ -.-> REDIS
    PQ -.-> REDIS
    EQ -.-> REDIS
    SQ -.-> REDIS
```

## Technology Stack

| Layer             | Technology                           | Purpose                                          |
| ----------------- | ------------------------------------ | ------------------------------------------------ |
| Runtime           | Node.js + NestJS 11 + TypeScript     | Application framework with dependency injection  |
| Database          | PostgreSQL 16                        | Persistent storage for firms, signals, scores    |
| Queue             | BullMQ 5 + Redis 7                   | Async job processing for pipeline stages         |
| ORM               | TypeORM 0.3                          | Entity mapping, schema sync, query building      |
| LLM (default)     | Anthropic SDK                        | Extraction fallback when confidence is low       |
| LLM (alternate)   | OpenAI SDK                           | Switchable via `LLM_PROVIDER=openai`             |
| Web Search        | Exa SDK                              | Semantic search for discovering firms and signals |
| Web Scraping      | Axios + Cheerio                      | HTML fetching and parsing for firm websites      |
| NLP               | compromise                           | Lightweight entity recognition and text analysis |
| API Documentation | Swagger (OpenAPI)                    | Auto-generated interactive API docs at `/docs`   |
| Containerization  | Docker + docker-compose              | One-command infrastructure setup                 |
| Code Quality      | ESLint 9 (flat config) + Prettier    | Linting and formatting                           |
| Testing           | Jest + Supertest                     | Unit and e2e test runner                         |

## Project Structure

```
backend/
├── docker-compose.yml                      Postgres + Redis + app containers
├── .env.example                            All environment variables documented
├── package.json                            Dependencies and scripts
├── nest-cli.json                           Build config (copies seed-firms.json to dist/)
│
└── src/
    ├── main.ts                             Entry point: port, Swagger, global ValidationPipe
    ├── app.module.ts                       Root module wiring all sub-modules
    │
    ├── config/                             Typed config namespaces (database, redis, app, llm, scrapers)
    │
    ├── common/
    │   ├── enums/                          FirmType, SignalType, SourceType, ExtractionMethod, JobType, etc.
    │   ├── interfaces/                     ScoringConfig, ExtractionResult, Extractor contract, metadata shapes
    │   └── utils/                          Rate limiter, text normalization, content hashing, job logger
    │
    ├── database/
    │   └── entities/                       8 TypeORM entities (see schema below)
    │
    ├── integrations/
    │   ├── exa/                            Exa API client (semantic web search)
    │   ├── openai/                         OpenAI client (LLM extraction)
    │   ├── anthropic/                      Anthropic client (LLM extraction, default)
    │   └── sec-edgar/                      SEC EDGAR client (Form ADV, CIK lookup)
    │
    └── modules/
        ├── firms/                          GET /api/firms — list, detail, signals, scores
        ├── people/                         GET /api/people — list, firm-specific people
        ├── rankings/                       GET /api/rankings — ranked firms, dimension breakdown
        └── pipeline/
            ├── pipeline.controller.ts      POST seed/collect/score/rescore, GET status
            ├── seeding/                    Stage 1: three sources + entity resolution + enrichment
            ├── collection/                 Stage 2: BullMQ processors + 5 signal collectors + 2 people collectors
            ├── extraction/                 Stage 3: layered pipeline + 4 extractors
            └── scoring/                    Stage 4: engine + 6 dimension scorers
```

## Database Schema

```mermaid
erDiagram
    firms ||--o{ firm_aliases : has
    firms ||--o{ people : employs
    firms ||--o{ firm_signals : produces
    firms ||--o{ firm_scores : receives
    firms ||--o{ scrape_jobs : tracks
    data_sources ||--o{ firm_signals : sources
    data_sources ||--o{ people : sources
    firm_scores ||--o{ score_evidence : explains
    firm_signals ||--o{ score_evidence : contributes

    firms {
        uuid id PK
        varchar name
        varchar slug UK
        varchar website
        numeric aum_usd
        varchar aum_source
        enum firm_type
        varchar headquarters
        int founded_year
        text description
        varchar sec_crd_number
        boolean is_active
        timestamp last_collected_at
        uuid data_source_id FK
        timestamp created_at
        timestamp updated_at
    }

    firm_aliases {
        uuid id PK
        uuid firm_id FK
        varchar alias_name
        varchar source
        timestamp created_at
    }

    people {
        uuid id PK
        uuid firm_id FK
        varchar full_name
        varchar title
        enum role_category
        varchar linkedin_url
        text bio
        uuid data_source_id FK
        float confidence
        timestamp created_at
        timestamp updated_at
    }

    data_sources {
        uuid id PK
        enum source_type
        enum target_entity
        varchar url
        varchar title
        timestamp retrieved_at
        varchar raw_content_hash
        text content_snippet
        float reliability_score
        jsonb metadata
        timestamp created_at
    }

    firm_signals {
        uuid id PK
        uuid firm_id FK
        enum signal_type
        jsonb signal_data
        uuid data_source_id FK
        timestamp collected_at
        enum extraction_method
        float extraction_confidence
    }

    firm_scores {
        uuid id PK
        uuid firm_id FK
        varchar score_version
        float overall_score
        jsonb dimension_scores
        int rank
        jsonb scoring_parameters
        int signal_count
        timestamp scored_at
        timestamp created_at
    }

    score_evidence {
        uuid id PK
        uuid firm_score_id FK
        uuid firm_signal_id FK
        varchar dimension
        float weight_applied
        float points_contributed
        text reasoning
    }

    scrape_jobs {
        uuid id PK
        uuid firm_id FK
        enum job_type
        enum status
        varchar queue_job_id
        timestamp started_at
        timestamp completed_at
        text error_message
        int retry_count
        jsonb metadata
        timestamp created_at
    }
```

## Key Design Decisions

### Raw signals vs. derived scores

The `firm_signals` table holds evidence collected from public sources. The `firm_scores` table holds computed outputs. This separation lets you re-score every firm without re-scraping by replaying signals through a new scoring configuration.

### Score versioning

Every scoring run is tagged with a `score_version` string (e.g. `v1.0`, `v2.0-experimental`). The `scoring_parameters` JSONB column stores the exact weights and thresholds used, making every score fully reproducible. A unique constraint on `(firm_id, score_version)` ensures one score per firm per version.

### Source provenance

Every signal links back to a `data_sources` row which stores the URL, retrieval timestamp, content hash, and a reliability score. A user can trace any score contribution back to its original source.

### Content deduplication

The `raw_content_hash` (SHA-256) on `data_sources` prevents re-processing identical content across collection runs.

### Entity resolution

The `firm_aliases` table stores all known name variants for a firm. The `EntityResolutionService` normalizes names, computes Levenshtein distance (15% threshold), and matches by website domain to merge duplicates during seeding.

### Layered extraction (cost optimization)

The extraction pipeline cascades from cheap (regex) to expensive (LLM). The LLM is only invoked when all prior layers produce zero high-confidence results, minimizing API token costs.

### Async pipeline via BullMQ

Long-running pipeline stages (seeding, collection, extraction, scoring) are processed through BullMQ queues. This provides retry support (3 attempts with exponential backoff for collection), concurrency control (10 workers per queue), and progress monitoring via the status endpoint.

### UUID v7 primary keys

All entities use UUID v7 (time-ordered UUIDs), which preserves insertion order while avoiding sequential ID enumeration.

## Module Dependency Graph

```mermaid
flowchart TD
    AppModule --> ConfigModule
    AppModule --> TypeOrmModule
    AppModule --> BullModule
    AppModule --> ExaModule
    AppModule --> OpenAIModule
    AppModule --> AnthropicModule
    AppModule --> SecEdgarModule
    AppModule --> FirmsModule
    AppModule --> PeopleModule
    AppModule --> RankingsModule
    AppModule --> PipelineModule

    PipelineModule --> ExaModule
    PipelineModule --> OpenAIModule
    PipelineModule --> AnthropicModule
    PipelineModule --> SecEdgarModule

    FirmsModule -.->|TypeORM| DB[(firms, firm_signals, firm_scores)]
    PeopleModule -.->|TypeORM| DB2[(people)]
    RankingsModule -.->|TypeORM| DB3[(firm_scores)]
    PipelineModule -.->|TypeORM| DB4[(all entities)]
    PipelineModule -.->|BullMQ| REDIS[(Redis queues)]
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | `localhost` | PostgreSQL host |
| `DB_PORT` | Yes | `5432` | PostgreSQL port |
| `DB_USERNAME` | Yes | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | Yes | `postgres` | PostgreSQL password |
| `DB_DATABASE` | Yes | `pe_intelligence` | PostgreSQL database name |
| `REDIS_HOST` | Yes | `localhost` | Redis host |
| `REDIS_PORT` | Yes | `6379` | Redis port |
| `EXA_API_KEY` | Yes | — | Exa API key (semantic web search) |
| `ANTHROPIC_API_KEY` | Conditional | — | Required if `LLM_PROVIDER=anthropic` (default) |
| `OPENAI_API_KEY` | Conditional | — | Required if `LLM_PROVIDER=openai` |
| `LLM_PROVIDER` | No | `anthropic` | LLM provider: `anthropic` or `openai` |
| `SEC_EDGAR_USER_AGENT` | Yes | — | User-agent for SEC EDGAR (use real email) |
| `PORT` | No | `3000` | Application port |
| `NODE_ENV` | No | `development` | `development` enables schema sync + query logging |
| `EXTRACTION_CONFIDENCE_THRESHOLD` | No | `0.5` | Min confidence for extraction results (0–1) |
