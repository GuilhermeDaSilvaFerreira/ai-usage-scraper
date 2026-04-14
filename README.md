# PE AI Intelligence

BD intelligence tool that discovers, scores, and ranks PE and private credit firms by their AI adoption maturity. It scrapes public sources (SEC EDGAR, Exa, LinkedIn, firm websites), extracts structured signals through a layered pipeline, and produces explainable 0–100 scores across six dimensions.

## Repository Structure

```
ai-usage-scraper/
├── backend/          NestJS API + data pipeline
├── frontend/         React analyst console
└── README.md         ← you are here
```

## Documentation

### Backend

| Document | Description |
|----------|-------------|
| [Getting Started](backend/docs/GETTING_STARTED.md) | Prerequisites, setup, running the pipeline, debugging |
| [Architecture](backend/docs/ARCHITECTURE.md) | System design, tech stack, database schema, key decisions, env vars |
| [Pipeline](backend/docs/PIPELINE.md) | Four-stage pipeline: seeding → collection → extraction → scoring |
| [API Reference](backend/docs/API.md) | API surface overview (full details in Swagger at `/docs`) |

### Frontend

| Document | Description |
|----------|-------------|
| [Architecture](frontend/docs/ARCHITECTURE.md) | Tech stack, project structure, pages, data flow, styling |

## Quick Start

```bash
# 1. Start infrastructure
cd backend
cp .env.example .env          # fill in API keys (Exa, Anthropic)
docker-compose up -d postgres redis

# 2. Start backend
pnpm install
pnpm dev                      # http://localhost:3000/api

# 3. Start frontend (new terminal)
cd ../frontend
pnpm install
pnpm dev                      # http://localhost:5173
```

## How It Works

```
POST /api/pipeline/seed       Discover firms from SEC, Exa, public rankings
POST /api/pipeline/collect    Gather AI signals + people (async, BullMQ)
                               ↳ Extraction runs automatically per source
POST /api/pipeline/score      Score firms across 6 dimensions (async)

GET  /api/rankings            View ranked results
GET  /api/firms/:id           Drill into a firm's score and evidence chain
GET  /api/pipeline/status     Monitor queue health
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | NestJS 11 · TypeScript · PostgreSQL 16 · BullMQ + Redis 7 · TypeORM |
| Pipeline | Exa SDK · Anthropic / OpenAI · Cheerio · compromise NLP |
| Frontend | React 19 · Vite 8 · TypeScript · AG Grid · shadcn/ui · Tailwind v4 |
