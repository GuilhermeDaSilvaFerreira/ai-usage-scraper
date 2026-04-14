# PE AI Intelligence — Backend

BD intelligence tool that discovers, scores, and ranks PE and private credit firms by their AI adoption maturity. It scrapes public sources, extracts structured signals, and produces explainable 0–100 scores across six dimensions.

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
| [Architecture](docs/ARCHITECTURE.md) | System design, tech stack, database schema, key decisions |
| [Pipeline](docs/PIPELINE.md) | Four-stage pipeline: seeding → collection → extraction → scoring |
| [API Reference](docs/API.md) | API surface overview (full details in Swagger at `/docs`) |

## Pipeline at a Glance

```
POST /api/pipeline/seed      →  Discover firms from SEC, Exa, public rankings
POST /api/pipeline/collect    →  Gather AI signals + people (async, BullMQ)
                                  ↳ Extraction runs automatically per source
POST /api/pipeline/score      →  Score firms across 6 dimensions (async)
GET  /api/pipeline/status     →  Monitor queue health and job history
```

## Tech Stack

NestJS 11 · TypeScript · PostgreSQL 16 · BullMQ + Redis 7 · TypeORM · Exa SDK · Anthropic / OpenAI · Cheerio · compromise NLP
