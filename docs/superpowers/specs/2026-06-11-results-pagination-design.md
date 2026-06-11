# Per-category paginated results with streamed backfill

- **Date:** 2026-06-11
- **Status:** Approved (design) — pending spec review
- **Area:** `lib/agent.js`, `app/api/recommend/route.js`, `app/page.jsx`, `components/screens/ResultsScreen.jsx`

## Goal

Let users browse a deeper catalogue per category without re-querying. Each
category (Films, TV) returns **up to 45** picks, shown **9 per page**. The first
page paints as fast as today; the remaining pages are fetched and ranked in the
background (server-side) while the user browses page 1, streaming in as they're
ready.

## Locked decisions

1. **Count scope:** per category — Films up to 45 **and** TV up to 45, each tab
   paginated independently.
2. **45 is a cap, not a quota (honest depth):** a category goes only as deep as
   relevance holds. Niche queries return 1–2 pages; never padded with off-vibe
   titles.
3. **Delivery (Approach A):** extend the existing NDJSON stream. No new endpoint,
   no server-side pagination state. Pagination is client-side over an
   accumulating pool.
4. **Page-1 UX:** keep the Billboard hero atop page 1; the grid below paginates
   9/page (pages 2+ are pure 3×3 grids). The hero is *extra* — page 1 shows hero
   + 9 grid cards; later pages show 9.
5. **Control:** Prev / Next buttons with a `Page X of Y` indicator between them.

## Architecture

### 1. Agent — deepening, honest-depth fill (`lib/agent.js`)

Today the final assembly keeps the top **20** per type (`slice(0, 20)`) and
`rankAndBadge(..., 40, ...)`, and the per-type fill runs a **single** discover
round. Changes:

- Raise the per-type cap **20 → 45**; `rankAndBadge(..., 90, ...)`. Interleaving
  is preserved, so the client recovers each category's best-first order by
  filtering on `kind`.
- Replace the single fill round with a **deepening loop** per deficient category:
  page through `tmdbDiscover({ page: 2, 3, … })`, `applyFilters` (genre/constraint
  gate), `dedupeByTitle`, rank, accumulate.
- **Honest-depth stop conditions** (per category, whichever first):
  - a discover page adds **fewer than 3 new *relevant*** titles (relevant =
    survives `applyFilters`), or
  - the category reaches **45**, or
  - a wall-clock budget (**~6s**) for the deepening phase elapses.
- **Streaming:** the first balanced set still emits via the existing early
  `onPartial` (fast page 1). Each deepening round then calls `onPartial` again
  with the full accumulated, ranked set tagged `phase: 'deepening'`. The final
  `done` carries the complete set.
- Reuses `tmdbDiscover` (add a `page` passthrough — TMDB discover already
  supports `page`), `applyFilters`, `byScore`, `dedupeByTitle`, `rankAndBadge`.
- **Scope:** deepening runs only for categories in scope for the query (per
  `searchKind`). A focused single-type query ("a thriller film", an actor query)
  deepens just that type; it does not fetch the other category's deep pages.
- Provider-filtered runs: deepening still passes through the availability gate,
  so a filtered search never pads later pages with unwatchable titles. Progressive
  `partial` emission stays **disabled** on filtered runs (as today, to avoid
  flashing unfiltered content); the deeper picks still arrive in the final `done`.

### 2. API — same stream, more of it (`app/api/recommend/route.js`)

No new endpoint and no new params. The deepening picks ride the existing
incremental `partial` channel; the only addition is the `phase: 'deepening'` tag
on those events so the client can (a) show a subtle "still finding more" hint and
(b) render a live-growing page count. `done` remains the terminal event with the
full set. The whole-result cache key is unchanged (the cached value is just the
larger final set).

### 3. Client — pagination over the accumulating pool (`page.jsx`, `ResultsScreen.jsx`)

- Picks accumulate into one array (as today). The view derives, per tab:
  `shown = picks.filter(tabMatch)`, `featured = shown[0]`,
  `gridItems = shown.slice(1)`, `pages = chunk(gridItems, 9)`.
- **Per-tab page state:** `{ all: 1, film: 1, tv: 1 }`. Reset to all-1 on a new
  search; **preserved** when switching tabs.
- **Live page count:** `Y = ceil(gridItems.length / 9)`. While the stream is in
  the `deepening` phase the indicator reads `Page X of Y+`, settling to `Page X
  of Y` on `done`. The current page never jumps as the pool grows.
- **Not-yet-arrived page:** if the user clicks ahead of what's streamed, show a
  brief skeleton until it lands (rare — Prev/Next only advances one page).
- **Single page → no control:** honest depth means many queries have one page;
  hide the Prev/Next control entirely then.
- **Page change:** `setPage` for the active tab and scroll the grid back to the
  top of the "More matches" section.
- **Existing appended row:** the `appendedCount` / "N more" idle-watchlist
  section stays a **separate** section below the paginated grid (it is a distinct
  feature, not part of the query result set, so it does not paginate).

## Data flow

```
query → /api/recommend (stream)
  → step/candidates events (as today)
  → partial (first balanced set)         ── client paints page 1 (hero + 9)
  → partial {phase:'deepening'} × N       ── pool grows; page count → "of Y+"
  → done (full set, ≤45/category)         ── indicator settles to "of Y"
client: chunk(filter(pool, tab).slice(1), 9) → Prev/Next over pages
```

## Edge cases

- **Stream dies mid-deepening:** whatever arrived paginates; the "finding more"
  hint clears on stream close.
- **Tab with 0 picks:** existing empty-state copy, no control.
- **Pool only ever grows during a search**, so a user's current page stays valid;
  no clamping needed mid-stream.
- **Refine / new search:** resets page state and the pool, same as today.

## Testing

- **Unit (node, `tests/agent.test.js` + a small client helper test):**
  - `chunk(items, 9)` page math; hero-excluded grid count.
  - per-category cap = 45.
  - honest-depth stop logic: stops when a round adds < 3 relevant; stops at 45;
    respects the budget (inject a clock).
  - dedupe across discover pages (no title appears on two pages).
- **Live:** broad query ("a feel-good comedy") streams multiple pages and the
  count climbs then settles; a niche query stops at 1–2 pages; page 1 is
  interactive before deepening completes; Films/TV page state is independent.

## Risks / coordination

- **Shared working tree:** two sessions are live and the "council Tier-1" work
  already touches `page.jsx`, `recommend/route.js`, and `ResultsScreen.jsx`.
  Implementation must stage **by path** (never `git add -A`) and re-check git
  state before committing.
- **TMDB rate / latency:** deepening adds discover calls. Bounded by the 45 cap,
  the <3-new stop, and the ~6s budget; calls are per-category and can run
  concurrently.
- **First-paint latency must not regress:** deepening runs strictly *after* the
  first `onPartial`; if the budget is 0 or discovery is empty, behaviour collapses
  to today's single-page result.

## Out of scope

- Numbered/jump-to pagination, infinite scroll (Prev/Next only).
- Server-side pagination state or a paged endpoint (Approach B).
- Forced fill to 45 (rejected in favour of honest depth).
