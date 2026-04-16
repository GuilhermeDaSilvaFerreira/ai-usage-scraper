# Data Pipeline Pages

## Rankings (`/`)

The home page. Displays an AG Grid of firms ranked by overall AI adoption score. Features:

- Firm type filter dropdown (Select component).
- Server-driven pagination (25 items per page) with PageNav.
- Click a row to navigate to the firm detail page.
- Columns: rank, firm name, type, AUM, overall score, signal count, scored date.

### Components

- `pages/rankings.tsx` — page component using `useRankings` hook
- `components/rankings/rankings-table-card.tsx` — AG Grid card
- `components/rankings/column-defs.ts` — column definitions
- `components/rankings/firm-type-filter.tsx` — filter dropdown

### API

- `api/rankings.ts` — `getRankings()`, `getDimensions()`

## Firm Detail (`/firms/:id`)

Deep dive into a single firm. Loads firm data, people, score, and signals in parallel. Sections:

- **Header** — name, badges, metadata (HQ, founded, website, AUM, SEC CRD).
- **Score Overview** — overall score, rank, dimension breakdown with progress bars and weights.
- **Key People** — AG Grid of AI/tech-relevant personnel with email column and outreach message generation (click a row to generate or view an LLM-powered pitch message).
- **Signals** — AG Grid of raw signals with server-side pagination (20 per page).
- **Scoring Evidence** — AG Grid of evidence chain entries with client-side pagination.
- **Outreach Campaigns** — campaign tracking card from the sales pipeline (see [sales-pipeline.md](sales-pipeline.md)).

### Components

- `pages/firm-detail.tsx` — page component using `useFirmDetail` and `useFirmSignals` hooks
- `components/firm-detail/firm-header.tsx` — metadata header
- `components/firm-detail/score-overview-card.tsx` — score breakdown
- `components/firm-detail/people-card.tsx` — people grid with outreach message panel
- `components/firm-detail/signals-card.tsx` — signals grid
- `components/firm-detail/evidence-card.tsx` — evidence grid
- `components/firm-detail/column-defs.ts` — AG Grid column definitions for people, signals, evidence

### API

- `api/firms.ts` — `getFirmById()`, `getFirmSignals()`, `getFirmScoreByVersion()`
- `api/people.ts` — `getFirmPeople()`
- `api/outreach.ts` — `getOutreachMessage()`, `generateOutreachMessage()` (for the people card)

## Pipeline (`/pipeline`)

Operational dashboard. Auto-polls the status endpoint every 15 seconds with a manual refresh button. Shows:

- **Queue cards** for each pipeline stage (seeding, signal collection, people collection, extraction, scoring) with badge counts for waiting, active, completed, failed, delayed.
- **Recent jobs** AG Grid with status badges and metadata.

### Components

- `pages/pipeline.tsx` — page component using `usePipelineStatus` hook
- `components/pipeline/queue-cards-section.tsx` — grid of queue status cards
- `components/pipeline/queue-card.tsx` — individual queue card
- `components/pipeline/recent-jobs-card.tsx` — recent jobs AG Grid
- `components/pipeline/status-cell.tsx` — status badge cell renderer

### API

- `api/pipeline.ts` — `getPipelineStatus()`
