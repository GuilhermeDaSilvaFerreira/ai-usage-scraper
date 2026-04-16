# Sales Pipeline API Reference

## Interactive Documentation

All endpoints are documented in Swagger at [http://localhost:3000/docs](http://localhost:3000/docs) under the **Outreach** tag.

**Base URL:** `http://localhost:3000/api`

## Outreach Campaigns (`/api/outreach`)

Track and manage sales outreach campaigns across PE firms. Campaigns are automatically created for every person at a firm after the firm completes scoring.

| Action | Method | Path | Description |
|--------|--------|------|-------------|
| List campaigns | `GET /` | `/outreach` | Paginated list with filters for status, platform, firm, and person name search |
| Stats | `GET /stats` | `/outreach/stats` | Aggregate counts by outreach status |
| By firm | `GET /firms/:firmId` | `/outreach/firms/:firmId` | All campaigns for a specific firm |
| By person | `GET /people/:personId/campaign` | `/outreach/people/:personId/campaign` | Campaign for a specific person |
| Detail | `GET /:id` | `/outreach/:id` | Single campaign with firm and person relations (includes `outreach_message`) |
| Create | `POST /` | `/outreach` | Create a new outreach campaign (normally auto-created by the pipeline) |
| Update | `PATCH /:id` | `/outreach/:id` | Update status, notes, platform, message, or analyst |
| Generate message | `POST /:id/generate-message` | `/outreach/:id/generate-message` | Generate outreach message via LLM, saves to campaign, returns updated campaign |

### Query Parameters (GET `/`)

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by person name (partial match, ILIKE) |
| `status` | `OutreachStatus` enum | Filter by campaign status |
| `contact_platform` | `ContactPlatform` enum | Filter by communication channel |
| `firm_id` | UUID | Filter by firm |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 25, max: 100) |

### Create Body (POST `/`)

```json
{
  "firm_id": "uuid",
  "person_id": "uuid",
  "contacted_by": "Analyst Name (optional)",
  "contact_platform": "email",
  "notes": "Optional internal notes"
}
```

Note: `contacted_by` is optional. Auto-created campaigns have `contacted_by: null`.

### Update Body (PATCH `/:id`)

All fields are optional:

```json
{
  "status": "first_contact_sent",
  "contact_platform": "linkedin",
  "contacted_by": "Analyst Name",
  "notes": "Updated notes",
  "outreach_message": "Edited message text"
}
```

Note: `contacted_by` can only be set once. After it is filled, subsequent updates to this field are ignored by the backend.

### Generate Message (POST `/:id/generate-message`)

Generates a fresh outreach message via the configured LLM provider (Anthropic or OpenAI). The generated message is automatically saved to `campaign.outreach_message` and the full updated campaign is returned.

If a message already exists, calling this endpoint overwrites it with a freshly generated one.

**Response:** Full `OutreachCampaign` object with the newly generated `outreach_message`.

## Auto-Creation Pipeline

After a firm completes scoring, the `ScoringProcessor` enqueues a job on the `outreach-campaigns` BullMQ queue. The `OutreachCampaignProcessor` then creates a default campaign for every person at the firm that doesn't already have one. Default campaigns have:

- `status: not_contacted`
- `contacted_by: null`
- No notes, no platform, no message

This ensures every scored firm has outreach campaigns ready for analysts to work on.

## Enums

### OutreachStatus

| Value | Label |
|-------|-------|
| `not_contacted` | Not contacted |
| `first_contact_sent` | First contact sent |
| `follow_up_sent` | Follow-up sent |
| `replied` | Replied |
| `under_negotiation` | Under negotiation |
| `declined` | Declined |
| `closed_won` | Closed (won) |
| `closed_lost` | Closed (lost) |

### ContactPlatform

| Value | Label |
|-------|-------|
| `email` | Email |
| `linkedin` | LinkedIn |
| `phone` | Phone |
| `other` | Other |
