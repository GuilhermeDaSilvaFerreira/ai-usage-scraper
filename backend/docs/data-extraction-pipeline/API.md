# Data Pipeline — API Reference

## Interactive Documentation

Swagger (OpenAPI), auto-generated from code and always up to date:

- **Local:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **Base URL:** `http://localhost:3000/api`

Use Swagger to test requests and inspect schemas. The outreach endpoints are documented separately in [Sales Pipeline — API](../sales-pipeline/API.md).

## Pipeline Control (`/api/pipeline`)

| Action | Method | Description |
|--------|--------|-------------|
| Seed | `POST /seed` | Enqueue firm discovery (SEC + Exa + public rankings + Wikipedia/Exa enrichment). Auto-chains into collection. |
| Collect all | `POST /collect` | Enqueue signal + people collection for every active firm not collected in 24h |
| Collect one | `POST /:firm_id/collect` | Enqueue signal + people collection for a single firm |
| Score | `POST /score` | Enqueue bulk scoring of all firms (optional config for A/B) |
| Re-score | `POST /rescore` | Sync re-scoring with new weights — no re-scraping |
| Status | `GET /status` | Queue counts for all six pipeline queues + 20 most recent scrape jobs |

## Firms (`/api/firms`)

| Action | Method | Description |
|--------|--------|-------------|
| List | `GET /` | Paginated list with search, type filter, AUM filter, sorting |
| Detail | `GET /:id` | Firm with aliases, people, scores, and latest evidence |
| Signals | `GET /:id/signals` | Paginated raw signals for a firm |
| All scores | `GET /:id/scores` | All score versions for a firm |
| Score by version | `GET /:id/scores/:version` | Specific score with its full evidence chain |

## People (`/api/people`)

| Action | Method | Description |
|--------|--------|-------------|
| List | `GET /` | Paginated list with search, role category, and firm filters |
| By firm | `GET /firms/:firmId/people` | All AI-relevant people at a given firm |

## Rankings (`/api/rankings`)

| Action | Method | Description |
|--------|--------|-------------|
| Rankings | `GET /` | Firms ranked by `overall_score` for a given `scoreVersion` |
| Dimensions | `GET /dimensions` | Top 10 firms per scoring dimension |
