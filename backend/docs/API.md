# API Reference

## Interactive Documentation

The full API reference is auto-generated from code via **Swagger (OpenAPI)** and is always up to date:

- **Local:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **Base URL:** `http://localhost:3000/api`

Use Swagger to explore endpoints, view request/response schemas, and test calls directly from the browser.

## API Surface Overview

### Pipeline Control (`/api/pipeline`)

Trigger and monitor the four-stage data pipeline.

| Action | Method | Description |
|--------|--------|-------------|
| Seed | `POST /seed` | Discover firms from SEC, Exa, and public rankings (async) |
| Collect all | `POST /collect` | Queue signal + people collection for all active firms (async) |
| Collect one | `POST /:firm_id/collect` | Queue collection for a single firm (async) |
| Score | `POST /score` | Score all firms with configurable weights (async) |
| Re-score | `POST /rescore` | Replay existing signals through new weights (sync, no re-scraping) |
| Status | `GET /status` | Queue health counts + 20 most recent jobs |

### Firms (`/api/firms`)

Browse the firm universe and drill into individual firm data.

| Action | Method | Description |
|--------|--------|-------------|
| List | `GET /` | Paginated list with search, type filter, AUM filter, sorting |
| Detail | `GET /:id` | Firm with aliases, people, scores, and latest evidence |
| Signals | `GET /:id/signals` | Paginated raw signals for a firm |
| All scores | `GET /:id/scores` | All score versions for a firm |
| Score by version | `GET /:id/scores/:version` | Specific score version with full evidence chain |

### People (`/api/people`)

AI/tech-relevant personnel discovered during collection.

| Action | Method | Description |
|--------|--------|-------------|
| List | `GET /` | Paginated list with search, role category, and firm filters |
| By firm | `GET /firms/:firmId/people` | All AI-relevant people at a given firm |

### Rankings (`/api/rankings`)

Ranked firm lists and per-dimension leaderboards.

| Action | Method | Description |
|--------|--------|-------------|
| Rankings | `GET /` | Firms ranked by overall score for a given version |
| Dimensions | `GET /dimensions` | Top 10 firms per scoring dimension |
