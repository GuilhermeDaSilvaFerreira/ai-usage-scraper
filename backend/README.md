# PE AI Intelligence — Backend

BD intelligence tool that discovers, scores, and ranks PE and private credit firms by their AI adoption maturity. It scrapes public sources, extracts structured signals, scores firms across six dimensions, and auto-seeds sales outreach campaigns against key people at each firm.

## Quick Start

```bash
cp .env.example .env         # fill in API keys
docker-compose up -d postgres redis
pnpm install
pnpm dev                     # http://localhost:3000/api
```

Swagger docs: [http://localhost:3000/docs](http://localhost:3000/docs)

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Prerequisites, setup, running the pipeline, debugging |
| [Testing](docs/TESTING.md) | Unit + E2E test layout, mocks, coverage |
| [Simple Pipeline Diagram](docs/SIMPLE_PIPELINE_DIAGRAM.md) | One-page cheat sheet of the full end-to-end flow |
| [Data Pipeline — Architecture](docs/data-extraction-pipeline/ARCHITECTURE.md) | System design, tech stack, database schema, key decisions |
| [Data Pipeline — Stages](docs/data-extraction-pipeline/PIPELINE.md) | Seeding → collection → extraction → scoring, with queues and chaining |
| [Data Pipeline — API](docs/data-extraction-pipeline/API.md) | Pipeline, firms, people, rankings endpoints |
| [Sales Pipeline — Architecture](docs/sales-pipeline/ARCHITECTURE.md) | Outreach campaign auto-creation + LLM message generation |
| [Sales Pipeline — API](docs/sales-pipeline/API.md) | Outreach endpoints |

## Pipeline at a Glance

```
POST /api/pipeline/seed       →  Discover firms (SEC, Exa, public rankings) + Wikipedia/Exa enrichment
                                  ↳ auto-chains to collection
POST /api/pipeline/collect    →  Collect AI signals + people per firm (BullMQ, per-source dedup)
                                  ↳ signal collection auto-enqueues extraction
                                  ↳ extraction completion auto-enqueues scoring (per firm)
                                  ↳ scoring auto-enqueues outreach campaign creation
POST /api/pipeline/score      →  Manual bulk re-score of all firms
POST /api/pipeline/rescore    →  Replay signals through new weights (A/B testing)
GET  /api/pipeline/status     →  Live queue counts + recent jobs
```

## Tech Stack

NestJS 11 · TypeScript · PostgreSQL 16 · BullMQ + Redis 7 · TypeORM · Exa SDK · Wikipedia REST · SEC EDGAR / IAPD · Anthropic / OpenAI · Axios + Cheerio · compromise NLP
