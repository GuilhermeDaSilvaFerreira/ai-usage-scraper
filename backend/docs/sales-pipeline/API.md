# Sales Pipeline — API Reference

Swagger (OpenAPI) at [http://localhost:3000/docs](http://localhost:3000/docs) under the **Outreach** tag.

**Base URL:** `http://localhost:3000/api`

## Outreach Campaigns (`/api/outreach`)

Campaigns are **auto-created for every person at a firm** when that firm finishes scoring (see [architecture](./ARCHITECTURE.md)).

| Action | Method | Path | Description |
|--------|--------|------|-------------|
| List | `GET` | `/outreach` | Paginated list with filters for `search` (person name), `firm_name`, `status`, `contact_platforms`, `firm_id` |
| Stats | `GET` | `/outreach/stats` | Aggregate campaign counts grouped by `OutreachStatus` |
| By firm | `GET` | `/outreach/firms/:firmId` | All campaigns for a firm (includes `person`) |
| By person | `GET` | `/outreach/people/:personId/campaign` | Single campaign for a person (includes `firm` + `person`) |
| Detail | `GET` | `/outreach/:id` | Campaign with `firm` + `person` relations and `outreach_message` |
| Create | `POST` | `/outreach` | Manual create (normally auto-created by the pipeline) |
| Update | `PATCH` | `/outreach/:id` | Update status, platforms, notes, message, or claim via `contacted_by` |
| Generate message | `POST` | `/outreach/:id/generate-message` | Generate outreach message via LLM, save to campaign, return updated record |

### Query parameters (GET `/outreach`)

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Person name (partial match, `ILIKE`) |
| `firm_name` | string | Firm name (partial match, `ILIKE`) |
| `status` | `OutreachStatus` | Exact status filter |
| `contact_platforms` | `ContactPlatform[]` | Matches campaigns whose `contact_platforms` array overlaps with any of the given values. Accepts repeated query params or a comma-separated list. |
| `firm_id` | UUID | Exact firm filter |
| `page` | number | Default `1` |
| `limit` | number | Default `25`, max `100` |

### Create body (POST `/outreach`)

```json
{
  "firm_id": "uuid",
  "person_id": "uuid",
  "contacted_by": "Analyst Name (optional)",
  "contact_platforms": ["email", "linkedin"],
  "notes": "Optional internal notes"
}
```

Auto-created campaigns start with `contacted_by: null` and `contact_platforms: []`.

### Update body (PATCH `/outreach/:id`)

All fields optional:

```json
{
  "status": "first_contact_sent",
  "contact_platforms": ["linkedin"],
  "contacted_by": "Analyst Name",
  "notes": "Updated notes",
  "outreach_message": "Edited message body"
}
```

- `contacted_by` is **immutable** once non-null — subsequent updates are ignored silently.
- Setting `status` to `first_contact_sent` auto-stamps `first_contact_at` the first time.
- Any status change updates `last_status_change_at`.

### Generate message (POST `/outreach/:id/generate-message`)

Runs the configured LLM (Anthropic or OpenAI) over firm + person + signals + score + source excerpts, writes the result to `campaign.outreach_message`, and returns the full updated `OutreachCampaign` (with `firm` + `person`). Re-running overwrites the existing message.

## Enums

### `OutreachStatus`

`not_contacted`, `first_contact_sent`, `follow_up_sent`, `replied`, `under_negotiation`, `declined`, `closed_won`, `closed_lost`

### `ContactPlatform`

`email`, `linkedin`, `phone`, `other` — stored as a PostgreSQL array, so a campaign can simultaneously record multiple channels used.
