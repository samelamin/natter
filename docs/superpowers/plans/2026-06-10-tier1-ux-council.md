# Tier-1 UX Council Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the council's Tier-1: per-user recommendation history, whole-result-set sharing with rich OG cards, title-page conversion, WhatsApp/X/Facebook share targets + TMDB attribution + OG-weight fix + watchlist rate limit + sitemap, and Redis-backed caches for speed.

**Architecture:** Five file-disjoint lanes build new modules/routes/components in parallel (no shared-file edits inside lanes). All shared-file wiring (app/page.jsx, ResultsScreen, Icons, ShareButton, lib/db.js SCHEMA) is quarantined into one sequential integration task applied after lanes finish, with git-state re-checks because two unrelated sessions edit this tree concurrently. Everything degrades gracefully without DATABASE_URL / REDIS_URL.

**Tech Stack:** Next.js 16 App Router (plain JS), React 19, Postgres via lib/db.js bootstrap pattern, node --test (Node 20 — `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`), official `redis` client (Lane E, the only new dependency).

---

## Global constraints (every task)

- Tests live in `tests/<name>.test.js` (repo glob is `tests/*.test.js`) — NOT `lib/*.test.js`.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js route/page/metadata/OG/sitemap code — this Next version differs from training data.
- Public repo: no secrets, no server hostnames/IPs/paths in any file.
- Do not touch `lib/agent.js`, `components/screens/WorkingScreen.jsx`, or the `applyEvent`/`runSearch` internals (a parallel session owns them today).
- Lanes do NOT run `git add`/`git commit` — the orchestrator commits after integration (parallel foreign sessions share this tree; staging is precise, never `-A`).
- Every new POST surface is rate-limited; every DB feature checks `dbAvailable()` and degrades; no handler may throw unhandled.

## File ownership map (conflict matrix)

| File | Owner |
|---|---|
| `lib/share.js`, `tests/share.test.js` | Task 1 (orchestrator, pre-lanes) |
| `app/api/history/route.js`, `components/screens/RecentPicks.jsx`, `lib/history.js`, `tests/history.test.js` | Lane A |
| `app/api/share/route.js`, `app/s/[id]/*`, `lib/shareset.js`, `tests/shareset.test.js` | Lane B |
| `components/screens/TitlePageActions.jsx`, `lib/watchlistItem.js`, `tests/watchlistItem.test.js` | Lane C |
| `components/natter/ShareSheet.jsx`, `lib/sharetext.js`, `tests/sharetext.test.js`, `app/sitemap.js`, `components/natter/TmdbAttribution.jsx`, `app/title/[kind]/[id]/opengraph-image.js` (modify), `app/api/watchlist/route.js` (modify) | Lane D |
| `lib/cache.js`, `tests/cache.test.js`, `app/api/recommend/route.js` (modify), `lib/tmdb.js` (modify, cache block only), `package.json`/`package-lock.json` | Lane E |
| `app/page.jsx`, `components/screens/ResultsScreen.jsx`, `components/natter/Icons.jsx`, `components/natter/ShareButton.jsx`, `lib/db.js`, `app/title/[kind]/[id]/page.jsx` | Integration task ONLY |

### Task 1: Shared pure helper `resizeImagePath` (pre-lanes, orchestrator)

**Files:** Modify `lib/share.js`; Test `tests/share.test.js`

- [ ] **Step 1: Write failing tests** in `tests/share.test.js`:

```js
import { resizeImagePath } from '../lib/share.js';
// swaps proxied size: resizeImagePath('/img/w500/abc.jpg','w342') === '/img/w342/abc.jpg'
// swaps absolute original: resizeImagePath('https://image.tmdb.org/t/p/original/x.jpg','w780') ends '/t/p/w780/x.jpg'
// no size segment → unchanged; null/undefined → null; missing size → input unchanged
```

- [ ] **Step 2: Run** `npm test` → new cases FAIL (no export)
- [ ] **Step 3: Implement** in `lib/share.js` (client-safe, pure):

```js
export function resizeImagePath(src, size) {
  if (!src) return null;
  if (!size) return src;
  return String(src).replace(/\/(original|w\d+)\//, `/${size}/`);
}
```

- [ ] **Step 4: Run** `npm test` → PASS (≥187 + new)

### Task 2 (Lane A): Per-user recommendation history

**Files:** Create `app/api/history/route.js`, `components/screens/RecentPicks.jsx`, `lib/history.js`, `tests/history.test.js`
**Contract:** council lane0 — `rec_history` table (DDL applied at integration), GET (12 newest) / POST (validated ≤10 picks, rate-limited `hist:`+user.id max 30/min, prune to 20 rows/user), `sanitizeHistoryPicks`/`historyLabel` pure helpers, RecentPicks renders "Pick up where you left off" row (≤6 entries, first-pick poster + query caption) only when signed-in and history exists; renders nothing on 401/empty/error.
**Tests:** cap-at-10, drop-bad-tmdbId, truncation/coercion, non-array → [], historyLabel safety.

### Task 3 (Lane B): Result-set sharing `/s/[id]`

**Files:** Create `app/api/share/route.js`, `app/s/[id]/page.jsx`, `app/s/[id]/opengraph-image.js`, `app/s/[id]/layout.jsx`, `lib/shareset.js`, `tests/shareset.test.js`
**Contract:** council lane1 — `shared_sets` table (DDL at integration), POST validates (query ≤200 required, picks via `sanitizeSetPicks` ≤8, IP rate-limit `share:` max 20/min, 503 without DB), `newShareId()` 12-char base62 via crypto.randomBytes(9); SSR page validates `/^[0-9A-Za-z]{12}$/`, H1 `N picks for "query"`, poster grid linking to /title pages, CTA `Get my own picks` → `/?q=`, `Open Natter`; layout exports `robots:{index:false,follow:true}`; OG image composes ≤4 posters at w342 via `tmdbImageUrl(resizeImagePath(poster,'w342'))`, <600KB, 2.5s per-image timeout, branded fallback.
**Tests:** id shape/uniqueness, cap-at-8, kind coercion + title truncation, null-safety, decodeKind.

### Task 4 (Lane C): Title-page conversion island

**Files:** Create `components/screens/TitlePageActions.jsx`, `lib/watchlistItem.js`, `tests/watchlistItem.test.js`
**Contract:** council lane2 — client island: fetches /api/auth/me on mount; light bar (Logo link home; Sign in / Your watchlist); primary `Save to watchlist` → signed-out opens existing AuthModal (signup, note mentions the title) then POSTs; signed-in POSTs optimistically → `Saved ✓`; failure → inline `Couldn’t save — watchlist may be unavailable.`; helper copy `Free account — keep a watchlist and get picks for your streaming services.`; `toWatchlistBody(item)` pure helper (null when tmdbId missing).
**Tests:** year/rating coercion, title slice 300, null on bad tmdbId, kind mapping.

### Task 5 (Lane D): Sharing reach + compliance bundle

**Files:** Create `components/natter/ShareSheet.jsx`, `lib/sharetext.js`, `tests/sharetext.test.js`, `app/sitemap.js`, `components/natter/TmdbAttribution.jsx`; Modify `app/title/[kind]/[id]/opengraph-image.js` (use `resizeImagePath(...,'w780')` backdrop / `'w500'` poster fallback — do NOT touch lib/tmdb.js), `app/api/watchlist/route.js` (rateLimited `wl:`+user.id max 60/min on POST+DELETE).
**Contract:** council lane3 — `shareTextFor(item)` + `buildTargets({url,text})` (wa.me / x.com/intent / facebook sharer, encoded); ShareSheet props {url,text,onCopied}, anchors target=_blank rel=noopener noreferrer + Copy link; SVG glyphs defined INSIDE ShareSheet.jsx (Icons.jsx is integration-owned); TmdbAttribution exact copy `This product uses the TMDB API but is not endorsed or certified by TMDB.` linking themoviedb.org; sitemap lists `/` only.
**Tests:** share text composition/omissions, URL encoding, x-link url-out-of-text, null-safety.

### Task 6 (Lane E): Redis read-through caches

**Files:** Create `lib/cache.js`, `tests/cache.test.js`; Modify `app/api/recommend/route.js` (L2 around existing L1, preserve bypass rules), `lib/tmdb.js` (cache block ~189–240 only), `package.json` (+`redis`)
**Contract (orchestrator-pinned):** `cacheAvailable()`, `cacheGetJSON(key,{timeoutMs=250})` → value|null never-throw, `cacheSetJSON(key,value,ttlSeconds)` fire-and-forget, `_setClientForTests()`; lazy `createClient({url:REDIS_URL})`, capped reconnects, error log-once; recommend: L1 miss → `rec:v1:`+key Redis get → emit+backfill / on fresh done cacheSet both (only when !bypassCache && picks>0); tmdb: L1 miss → `tmdb:v1:`+sha256(url) get (150ms) → backfill / fetch → set both TTL 3600. Redis down ⇒ identical behavior to today.
**Tests:** fail-open without REDIS_URL, fake-client round-trip, get timeout → null, set error swallowed, tmdb read-through via `_setClientForTests` + `_testCacheClear` + mocked fetch (3rd call served from fake Redis, fetch not called).

### Task 7: Integration (sequential, orchestrator)

- [ ] Re-run `mcp__ccd_session_mgmt__list_sessions` + `git status` + re-read each contended file before editing.
- [ ] `lib/db.js`: append `rec_history` + `shared_sets` DDL blocks to SCHEMA.
- [ ] `app/page.jsx`: Lane A wiring (RecentPicks above IdleScreen, `openHistorySet`, fire-and-forget history POST beside the localStorage write in the `done` branch); Lane B wiring (`shareSet` callback + `onShareSet` prop); Lane D wiring (TmdbAttribution near footer/toast region) — exact code in the council integration_specs.
- [ ] `components/screens/ResultsScreen.jsx`: `Share these picks` Button in `.refine` block, gated on results present.
- [ ] `components/natter/Icons.jsx`: add whatsapp/x/facebook keys (move glyphs from ShareSheet local defs if cleaner — additive only).
- [ ] `components/natter/ShareButton.jsx`: opt-in `targets` prop (default false) rendering ShareSheet on desktop; pass on /title + /s pages only.
- [ ] `app/title/[kind]/[id]/page.jsx`: render TitlePageActions + TmdbAttribution (+ ShareButton targets).
- [ ] Run full `npm test` (Node 20).

### Task 8: Opus review → apply findings (superpowers:requesting-code-review / receiving-code-review)

### Task 9: Verify (superpowers:verification-before-completion)

- [ ] `npm test` green (baseline 187 + new).
- [ ] Dev server :3210; browser-verify each lane's checklist (see lane JSONs) incl. OG image sizes <600KB, share targets, history reopen with no /api/recommend call, watchlist save from title page, 1.8s fast-path unregressed.

### Task 10: Commit + deploy + smoke (per private deploy runbook in memory — git-archive snapshot; add REDIS_URL to server env)

### Task 11: Secrets scan → push main → final report with before/after evidence
