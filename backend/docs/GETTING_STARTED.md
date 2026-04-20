# Getting Started

## Prerequisites

- **Node.js** 20+ and **pnpm**
- **Docker** and **Docker Compose** (for PostgreSQL and Redis)
- **API Keys**: Exa (required), Anthropic or OpenAI (for LLM extraction fallback)

## Setup

### 1. Install Dependencies

```bash
cd ai-usage-scraper/backend
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your API keys:

```env
# Required — semantic web search for firm discovery and signal collection
EXA_API_KEY=your-exa-api-key

# Required — LLM extraction fallback (Anthropic is the default provider)
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Alternative LLM provider (uncomment to use OpenAI instead)
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-your-openai-api-key

# Required — SEC EDGAR requests need a real contact email
SEC_EDGAR_USER_AGENT=YourCompany admin@yourcompany.com
```

Additional knobs:

```env
# LLM people extraction (used during people collection)
LLM_PEOPLE_ENABLED=true        # set "false" to disable the LLM people fallback
LLM_PEOPLE_BATCH_SIZE=6        # sources per LLM call (tune for cost vs. latency)

# Pipeline automation
PIPELINE_AUTO_CHAIN=true       # seed → collect → extract → score → outreach
PIPELINE_CRON_SCHEDULE=0 0 * * 0   # Sunday midnight
PIPELINE_SEED_TARGET=50

# Extraction
EXTRACTION_CONFIDENCE_THRESHOLD=0.5
```

See [Architecture > Environment Variables](data-extraction-pipeline/ARCHITECTURE.md#environment-variables) for the full reference.

### 3. Start Infrastructure

```bash
docker-compose up -d postgres redis
```

This starts PostgreSQL 16 and Redis 7 with persistent volumes. Wait a few seconds for health checks to pass.

### 4. Start the Application

```bash
pnpm dev          # development mode with auto-reload
```

The API is now available at `http://localhost:3000/api` and Swagger docs at `http://localhost:3000/docs`.

## Running the Pipeline

The pipeline runs in four stages. Execute them in order:

```bash
# Stage 1 — Seed the firm universe (async)
curl -X POST http://localhost:3000/api/pipeline/seed \
  -H "Content-Type: application/json" \
  -d '{ "target_firm_count": 150 }'

# Stage 2 + 3 — Collect signals and people for all firms (async via BullMQ)
# Extraction runs automatically after each source is collected
curl -X POST http://localhost:3000/api/pipeline/collect

# Stage 4 — Score all firms
curl -X POST http://localhost:3000/api/pipeline/score

# Monitor pipeline progress at any moment
curl http://localhost:3000/api/pipeline/status
```

### View Results

```bash
# Top ranked firms
curl http://localhost:3000/api/rankings

# Firm detail with evidence chain
curl http://localhost:3000/api/firms/{firm-id}

# Score breakdown by dimension
curl http://localhost:3000/api/rankings/dimensions
```

### Re-scoring (A/B Testing)

Test different scoring weights without re-collecting data:

```bash
curl -X POST http://localhost:3000/api/pipeline/rescore \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v2.0-talent-heavy",
    "weights": {
      "ai_talent_density": 0.40,
      "public_ai_activity": 0.15,
      "ai_hiring_velocity": 0.15,
      "thought_leadership": 0.10,
      "vendor_partnerships": 0.10,
      "portfolio_ai_strategy": 0.10
    }
  }'

# Compare versions
curl "http://localhost:3000/api/rankings?scoreVersion=v1.0"
curl "http://localhost:3000/api/rankings?scoreVersion=v2.0-talent-heavy"
```

## Full Docker Deployment

To run everything in Docker (app + database + Redis):

```bash
docker-compose up -d
```

The app container builds from `Dockerfile`, waits for Postgres and Redis health checks, and starts on port 3000. API keys are read from `.env`.

## Scripts

| Script              | Description                             |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Start in watch mode with auto-reload    |
| `pnpm run debug`    | Start in debug mode with Node inspector |
| `pnpm run build`    | Compile TypeScript to `dist/`           |
| `pnpm start:prod`   | Run compiled output from `dist/`        |
| `pnpm run lint`     | Run ESLint with auto-fix                |
| `pnpm run format`   | Run Prettier on all source files        |
| `pnpm test`         | Run Jest unit tests                     |
| `pnpm run test:e2e` | Run end-to-end tests                    |

## Debugging

### Swagger

Interactive API docs at [http://localhost:3000/docs](http://localhost:3000/docs). Use them to test endpoints and inspect request/response schemas.

### Queue Monitoring

Check pipeline health via the status endpoint:

```bash
curl http://localhost:3000/api/pipeline/status
```

This returns live BullMQ queue counts (waiting, active, completed, failed, delayed) for all five queues plus the 20 most recent `scrape_jobs`.

### Job Logs

Pipeline processors write structured JSON logs to `logs/` in the backend root (one file per job run, named `<jobName>_<timestamp>.json`). These logs contain detailed extraction/collection traces useful for debugging individual firm processing.

### Application Logs

NestJS logs to stdout. In `NODE_ENV=development`, TypeORM also logs all SQL queries. Use `pnpm run debug` to attach a Node.js inspector for breakpoint debugging.

### Common Issues

| Symptom                        | Likely Cause                                                               | Fix                                           |
| ------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------- |
| `ECONNREFUSED :5432`           | PostgreSQL not running                                                     | `docker-compose up -d postgres`               |
| `ECONNREFUSED :6379`           | Redis not running                                                          | `docker-compose up -d redis`                  |
| Seeding finds 0 firms          | Missing or invalid `EXA_API_KEY`                                           | Check `.env`                                  |
| LLM extraction skipped         | Missing `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` if `LLM_PROVIDER=openai`) | Check `.env`                                  |
| Collection hangs               | Rate limiter waiting on Exa/SEC                                            | Normal — check `pipeline/status` for progress |
| Score is `null` for a firm     | Fewer signals than `min_signals_for_score` (default: 1)                    | Run collection first, or lower threshold      |
| Schema drift after code change | `synchronize: true` only in development                                    | Restart the app to apply entity changes       |
