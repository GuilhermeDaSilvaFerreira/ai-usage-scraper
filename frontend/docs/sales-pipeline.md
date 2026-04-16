# Sales Pipeline Pages

## Outreach List (`/outreach`)

Dashboard for tracking sales outreach campaigns across all PE firms. Located under the "Sales Pipeline" section in the sidebar navigation. Campaigns are automatically created after firms are scored.

### Features

- **Stats bar** — aggregate counts for each outreach status (not contacted, first contact sent, under negotiation, closed won, etc.)
- **Campaign grid** — AG Grid table of all campaigns, clickable rows navigate to the campaign detail page
- **Search** — text input to search campaigns by person name
- **Filters** — status and platform dropdowns above the grid

### Components

- `pages/outreach.tsx` — page component using `useOutreach` hook, navigates to `/outreach/:id` on row click
- `components/sales-pipeline/outreach-stats-bar.tsx` — status count cards
- `components/sales-pipeline/outreach-column-defs.ts` — AG Grid column definitions
- `components/sales-pipeline/outreach-status-badge.tsx` — colored badge for outreach status

### API

- `api/outreach.ts`:
  - `getOutreachCampaigns(params)` — paginated campaign list (supports `search` param)
  - `getOutreachStats()` — status aggregate counts
  - `getOutreachCampaign(id)` — single campaign detail
  - `getOutreachCampaignByPerson(personId)` — find campaign for a person
  - `updateOutreachCampaign(id, data)` — update campaign (includes `outreach_message`)
  - `generateCampaignMessage(campaignId)` — generate message via LLM, returns updated campaign
  - `getOutreachByFirm(firmId)` — campaigns for a firm

### Hook

- `hooks/use-outreach.ts` — loads campaigns and stats, exposes filter state (including search) and refresh

## Campaign Detail (`/outreach/:id`)

Full-page editor for a single outreach campaign. Reached by clicking a campaign row in the list or a person name in the firm detail people grid.

### Features

- **Status** — select dropdown for campaign status
- **Platform** — select dropdown for contact platform
- **Contacted by** — text input for analyst name. Once filled and saved, becomes read-only (immutable). If the user tries to change the status without filling this field, a red validation error is shown.
- **Notes** — freeform textarea
- **Outreach message** — large textarea with a "Generate with AI" / "Re-generate with AI" button. The LLM generates the message on the backend, saves it to the campaign, and the frontend refetches to update. The textarea is always editable for manual tweaks.
- **Save button** — disabled until changes are detected. Validates that `contacted_by` is filled before allowing status changes.
- **Navigation** — link back to outreach list and to firm detail page

### Components

- `pages/outreach-detail.tsx` — full page component

## Firm Outreach Card (on Firm Detail page)

A read-only card on the firm detail page showing all outreach campaigns for that firm. Each person name links to the campaign detail page.

### Component

- `components/sales-pipeline/firm-outreach-card.tsx` — mini table of campaigns for a firm with links to campaign detail pages

## People Card (on Firm Detail page)

The people grid on the firm detail page links person names to their outreach campaigns. Clicking a person name calls `GET /outreach/people/:personId/campaign` and navigates to `/outreach/:campaignId`. The name column is styled as a link (primary color, underline on hover).

### Types

- `types/outreach.ts` — `OutreachCampaign` (includes `outreach_message`, nullable `contacted_by`), `OutreachStats`
- `types/common.ts` — `OutreachStatus`, `ContactPlatform`, `OUTREACH_STATUSES`, `CONTACT_PLATFORMS`
- `types/person.ts` — `email` field (no longer has `outreach_message`)
