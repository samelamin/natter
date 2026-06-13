# Feedback Admin Design

## Summary

Natter will collect lightweight product feedback from global visitors without
interrupting the recommendation flow. Visitors can submit anonymously from the
home screen. Sam can review and triage feedback in a private admin page, while
periodic agents can read and update the same queue through protected JSON APIs.

## Goals

- Add a quiet "Suggest an improvement" entry point to the home screen.
- Store feedback in Postgres with enough metadata for review and prioritisation.
- Provide a private admin page for human triage.
- Provide protected machine-readable endpoints for periodic feedback-review agents.
- Surface aggregate feedback health in Grafana without exposing full feedback text.
- Keep all credentials and deployment secrets out of the open-source repo.

## Non-Goals

- No public feedback board.
- No email sending or external ticket creation in this iteration.
- No full role-based admin system. Basic admin auth is enough for one operator.
- No raw full feedback text in Loki/Grafana panels.

## Visitor Experience

The home screen keeps search as the primary action. Under the existing hint,
Natter adds a secondary inline button labelled "Suggest an improvement". The
button opens a compact modal styled like the rest of Natter.

The form contains:

- required feedback text,
- optional category: idea, bug, confusing, praise,
- optional contact field,
- automatic page path context.

On success, the modal shows a short thank-you state and does not navigate away.
If storage is unavailable, the user sees a retryable error.

## Data Model

Postgres gains a `feedback` table:

- `id` identity primary key,
- `message` text,
- `category` constrained text,
- `contact` optional text,
- `page` optional text,
- `country` optional Cloudflare country code,
- `ip_hash` optional short stable hash,
- `user_agent` optional text,
- `status` constrained text: `new`, `reviewing`, `liked`, `actioned`, `closed`,
- `notes` optional operator/agent notes,
- `created_at`, `updated_at`, `reviewed_at`.

Input validation caps message, contact, page, user agent, and notes lengths.
The server stores only an IP hash, matching the existing usage logging privacy
posture.

## API Flow

`POST /api/feedback` accepts public submissions. It validates JSON, applies a
small per-IP rate limit, inserts into Postgres, emits a sanitized usage line
with `route: "feedback"`, and returns `{ ok: true, id }`.

`GET /api/admin/feedback` lists feedback items for the admin UI and agents.
Query parameters support `status`, `limit`, and `before` for simple queue reads.

`PATCH /api/admin/feedback/:id` updates status and notes. Both admin endpoints
require authorization.

Admin authorization supports either:

- HTTP Basic auth using `NATTER_ADMIN_USER` and `NATTER_ADMIN_PASSWORD`, or
- bearer token using `NATTER_AGENT_TOKEN` for periodic agents.

These values live in `.env.local` / server environment only.

## Admin UI

`/admin/feedback` is a server-rendered admin page. If auth fails, it returns a
Basic auth challenge. Once authorized it renders:

- summary counts by status,
- filter buttons by status,
- newest-first feedback cards,
- category, country, page, created time, and optional contact,
- status actions: reviewing, liked, actioned, closed,
- notes editor per item.

The admin page posts updates via the protected PATCH endpoint. It uses the
existing global styling and restrained admin-specific CSS.

## Agent Review Flow

Periodic agents authenticate with `Authorization: Bearer $NATTER_AGENT_TOKEN`.
They can:

1. Pull new feedback: `GET /api/admin/feedback?status=new&limit=50`.
2. Mark an item `reviewing` while assessing it.
3. Mark promising items `liked` with notes.
4. Mark completed items `actioned`, or non-actionable items `closed`.

Agents should not need Sam's browser password. They get a separate token that
can be rotated independently.

## Grafana

The existing Loki dashboard should add aggregate feedback panels:

- feedback submissions over time,
- feedback by category,
- feedback by country,
- recent sanitized feedback events showing category/country/status only.

Full messages and contact details stay in Postgres/admin only, not public
Grafana logs.

## Error Handling And Privacy

- If `DATABASE_URL` is unset, public submission returns 503.
- Malformed bodies return 400.
- Over-long fields return 400.
- Rate-limited clients receive 429.
- Logging never includes raw IP, contact, or full message text.
- Admin credentials are never committed.

## Testing

Unit tests cover feedback sanitization, status parsing, auth checks, and usage
line sanitization. Route behavior is verified through focused tests where pure
logic is available, plus full `npm test`, lint, build, and browser smoke tests.
