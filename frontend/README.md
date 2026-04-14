# PE AI Intelligence — Frontend

Internal analyst console for browsing firm rankings, drilling into individual firm AI adoption scores, and monitoring the data pipeline. Built with React 19, AG Grid, and Tailwind v4.

## Quick Start

```bash
cd ai-usage-scraper/frontend
pnpm install
pnpm dev          # http://localhost:5173
```

The dev server proxies `/api` requests to `http://localhost:3000` (the backend). Make sure the backend is running first.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Tech stack, project structure, pages, data flow, styling |

## Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Rankings | Ranked firm list with type filter, AUM, scores — click a row to drill in |
| `/firms/:id` | Firm Detail | Score overview, dimension breakdown, key people, signals, evidence chain |
| `/pipeline` | Pipeline | Live queue health (polls every 15s) and recent job history |

## Tech Stack

React 19 · Vite 8 · TypeScript 6 · React Router 7 · AG Grid · shadcn/ui (Radix) · Tailwind v4 · Axios · React Compiler
