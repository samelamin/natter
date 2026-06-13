# Feedback Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visitor feedback collection, a private feedback admin, agent queue APIs, and Grafana aggregate panels.

**Architecture:** Store feedback in the existing Postgres bootstrap schema and centralize validation/auth/query helpers in `lib/feedback.js`. Public submission uses `POST /api/feedback`; human admins use `/admin/feedback`; agents use protected JSON endpoints under `/api/admin/feedback`.

**Tech Stack:** Next.js 16 App Router route handlers/pages, React 19, Postgres via `pg`, Node test runner, Loki/Grafana JSON dashboard.

---

## File Structure

- `lib/feedback.js`: Pure validation, auth, status, DTO, and DB helper functions.
- `lib/db.js`: Add the feedback table and indexes to the existing schema bootstrap.
- `lib/usage.js`: Allow sanitized feedback usage events without message/contact text.
- `app/api/feedback/route.js`: Public feedback submission endpoint.
- `app/api/admin/feedback/route.js`: Protected admin/agent listing endpoint.
- `app/api/admin/feedback/[id]/route.js`: Protected update endpoint.
- `app/admin/feedback/page.jsx`: Server-rendered admin page.
- `components/screens/FeedbackModal.jsx`: Client modal used from the home screen.
- `components/screens/IdleScreen.jsx`: Add the quiet feedback entry point.
- `app/page.jsx`: Own feedback modal state and toast integration.
- `styles/ui.css`: Feedback modal/admin styling.
- `deploy/grafana/natter-usage.json`: Aggregate feedback panels.
- `.env.example`: Document env var names only.
- `tests/feedback.test.js`: Pure validation/auth tests.
- `tests/usage.test.js`: Extend logging privacy tests.

## Tasks

### Task 1: Feedback Core And Tests

**Files:**
- Create: `tests/feedback.test.js`
- Create: `lib/feedback.js`
- Modify: `lib/db.js`

- [ ] **Step 1: Write failing tests**

Test valid public submissions, message length limits, category coercion, status parsing, Basic auth, bearer auth, and safe DTO output.

Run: `npm test -- tests/feedback.test.js`
Expected: FAIL because `lib/feedback.js` does not exist.

- [ ] **Step 2: Implement minimal core**

Create validation and auth helpers, then add the `feedback` table to the DB schema.

- [ ] **Step 3: Verify tests pass**

Run: `npm test -- tests/feedback.test.js`
Expected: PASS.

### Task 2: Public Submission API And Client Modal

**Files:**
- Create: `app/api/feedback/route.js`
- Create: `components/screens/FeedbackModal.jsx`
- Modify: `components/screens/IdleScreen.jsx`
- Modify: `app/page.jsx`
- Modify: `styles/ui.css`

- [ ] **Step 1: Add endpoint against core helpers**

Validate body, rate limit by IP, insert feedback, log sanitized usage, return JSON.

- [ ] **Step 2: Add modal UI**

Open from a secondary inline prompt under the home hint; show success/error states.

- [ ] **Step 3: Verify UI compiles**

Run: `npm run lint`
Expected: PASS.

### Task 3: Admin And Agent APIs

**Files:**
- Create: `app/api/admin/feedback/route.js`
- Create: `app/api/admin/feedback/[id]/route.js`
- Modify: `lib/feedback.js`

- [ ] **Step 1: Add protected list endpoint**

Support `status`, `limit`, and `before`.

- [ ] **Step 2: Add protected update endpoint**

Support status and notes updates.

- [ ] **Step 3: Verify focused tests**

Run: `npm test -- tests/feedback.test.js`
Expected: PASS.

### Task 4: Admin Page

**Files:**
- Create: `app/admin/feedback/page.jsx`
- Modify: `styles/ui.css`

- [ ] **Step 1: Server-render protected page**

Challenge with Basic auth when missing/invalid. Render summary and cards when authorized.

- [ ] **Step 2: Wire inline update forms**

Forms submit PATCH requests with Basic auth inherited by the browser.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

### Task 5: Grafana And Deployment Docs

**Files:**
- Modify: `deploy/grafana/natter-usage.json`
- Modify: `.env.example`
- Modify: `deploy/README.md`

- [ ] **Step 1: Add feedback panels**

Add aggregate feedback count, category, country, and sanitized recent event panels.

- [ ] **Step 2: Document env names**

Document `NATTER_ADMIN_USER`, `NATTER_ADMIN_PASSWORD`, `NATTER_AGENT_TOKEN` without values.

- [ ] **Step 3: Verify dashboard JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('deploy/grafana/natter-usage.json','utf8')); console.log('ok')"`
Expected: `ok`.

### Task 6: Full Verification, Merge, Deploy

**Files:**
- All touched files.

- [ ] **Step 1: Full local verification**

Run: `npm test`, `npm run lint`, `npm run build`.

- [ ] **Step 2: Browser smoke**

Run dev server, submit feedback locally, open admin page, update status.

- [ ] **Step 3: Commit and merge**

Stage only intended files, commit, switch to main, merge, run verification on main.

- [ ] **Step 4: Deploy to naseyma**

Set admin env values on the server without committing them, rsync repo, rebuild container, copy Grafana dashboard, verify live public submission and admin login.
