# Per-title share — design

**Status:** revised after council review (6 lenses), pending spec re-review
**Date:** 2026-06-10

> **Council changes incorporated:** server/client boundary corrected; route-level
> input validation made explicit; OG-image caching made real (no "Cloudflare just
> caches it" assumption); Twitter card fields added; `lib/share.js` slimmed; toast
> + share-button placement specified; dead `DetailModal` share button wired;
> loading/error UX + test-runner wiring + OG backdrop timeout/font added.

## Goal

Let users share a single recommendation (a "tile") as a link that unfurls a rich,
title-specific preview card on social platforms — instead of the generic site
card. A cold visitor who clicks the link lands on a real page for that title and
can convert into a Natter user.

Builds on existing pieces: picks already carry `tmdbId`, `kind`, and
`backdropSrc`; `getDetails()` (lib/tmdb.js) fully enriches a title; we already
have `next/og` (app/opengraph-image.js) and the `/img` proxy.

## URL scheme

```
/title/[kind]/[id]      e.g. /title/film/693134   (Dune: Part Two)
                             /title/tv/1396        (Breaking Bad)
```

- `kind` is `film` | `tv` (matches the app's `pick.kind`). The route maps
  `film → movie` for the TMDB call. Kind is in the path because TMDB ids are
  **not** unique across film and TV.
- Readable trailing slug (`…/dune-part-two`) is **out of scope for v1** — easy to
  add later without breaking the id-based route (with `alternates.canonical`
  preventing duplicate-content splits when it lands).

## Security & input validation (must-do)

The route exposes `getDetails()` over clean public path segments, so validate at
the boundary — do **not** rely on `getDetails`'s old permissive behaviour:

- **`id`** must match `/^\d+$/`. An unvalidated id path-injects into the TMDB URL
  (`693134/../../authentication/token/new` → pivots `TMDB_KEY` to other
  endpoints). *(getDetails now enforces this directly — landed 2026-06-10 with
  tests; the route should reject early too so a bad id is a clean `notFound()`,
  not a thrown 500.)*
- **`kind`** must be exactly `film` | `tv` at the route → 404 otherwise. Do not
  rely on `getDetails` to reject it (it maps any non-`tv` to movie).
- **404 on a positive signal:** gate `notFound()` on the result actually being a
  real title (e.g. a present `title`/`tmdbId`), not merely "getDetails threw" —
  `fromMovie/fromTv` don't throw on a shape mismatch and would otherwise render a
  blank card.

## Components

| Unit | File | Type | Responsibility |
|------|------|------|----------------|
| Landing page | `app/title/[kind]/[id]/page.jsx` | server | Validate params, `getDetails()`, render detail + soft CTA; `generateMetadata()` |
| Loading state | `app/title/[kind]/[id]/loading.jsx` | server | Skeleton + CTA while getDetails resolves (can take ~5s cold) |
| OG card | `app/title/[kind]/[id]/opengraph-image.js` | server (`next/og`) | 1200×630 cinematic card + explicit cache header |
| Share helper | `lib/share.js` | pure | `shareUrlFor(pick)` only |
| Abs-image helper | `lib/tmdb.js` | pure | `tmdbImageUrl(path)` colocated next to `img()` (its inverse) |
| Share button | `components/natter/ShareButton.jsx` | client | Web Share API → copy-link + `aria-live` confirmation |
| Wiring | `components/natter/index.jsx`, `components/screens/DetailModal.jsx` | client | Mount `ShareButton` in `PosterCard`, `Billboard`, **and the existing dead Share button in `DetailModal` (line 125)** |

Dropped from the v1 plan vs the first draft: `tmdbTypeFromKind` — `getDetails`
already maps `film→movie` internally, so a named, separately-tested helper is dead
surface area (YAGNI). `tmdbImageUrl` moves into `lib/tmdb.js` next to `img()` so
the proxy-path coupling lives in one place.

`lib/share.js` must stay **pure** (no `lib/tmdb.js` import, no `process.env`, no
`next/og`) — it is imported by the client `ShareButton`, and the repo's rule is
that no client component pulls in server-only `lib/tmdb.js`.

## Data flow

```
shared link  →  /title/film/693134
                   ├─ page.jsx  → validate → getDetails({tmdbId, kind:'movie'}) → render + CTA
                   └─ opengraph-image.js → validate → getDetails(...) → ImageResponse(cinematic card)
```

`getDetails()` has a 1-hour in-memory cache (shared in the single standalone
`node server.js` process), so steady-state the page + OG image are one upstream
fetch per title per hour — **except** a cold concurrent race (crawler fetches HTML
then the image before either resolves) can fire two, since `fetchJson` has no
in-flight coalescing. Acceptable for v1; noted so the "single fetch" claim isn't
overstated.

## The landing page

`page.jsx` is a **Server Component** that `await`s `params` (a Promise in Next 16)
and `getDetails()`, then renders the title. The presentational components in
`components/natter` are `'use client'` (the whole module is) — that's fine: Next
**server-renders them to HTML**, so crawlers and cold visitors get a real page;
interactive bits (e.g. `TrailerStage`) already self-contain their own state. There
is no server-only subset to carve out, and no "island" plumbing needed — the
established precedent is `app/marketing/page.jsx` rendering these same components.
`generateMetadata` stays a server export on this page (only Server Components
support it).

Content: backdrop hero, title, year · rating · cert · runtime, blurb,
where-to-watch, cast, trailer. One soft CTA — `Get recommendations on Natter →`
linking to `/`. No embedded search box (rejected "prominent funnel").

Error/empty: invalid `kind`/`id` or a result with no real title → `notFound()`
(404). A transient TMDB failure should degrade to a soft "couldn't load this title
— open Natter" with the CTA rather than a bare 404 (the conversion goal).

## The OG card (cinematic)

`ImageResponse`, `size = {width:1200, height:630}`, `contentType: image/png`,
fetched/rendered per request:

- Title's **w1280 backdrop** full-bleed; flat dark band with title + `★ rating` +
  genres; small Natter mark.
- **Caching (must-do):** `next/og` defaults to `Cache-Control: max-age=0,
  must-revalidate`, and nothing in nginx/Cloudflare caches it by default — so set
  an explicit long header on the `ImageResponse` (e.g. `public, max-age=86400,
  s-maxage=604800, immutable`, mirroring `app/img/[...path]/route.js:38`) **and**
  add a Cloudflare cache rule for `/title/*/opengraph-image`. Without this, every
  scrape re-runs getDetails + a backdrop fetch + Satori raster on an unbounded id
  space — a cheap DoS amplifier.
- **Backdrop fetch hardening:** the in-`ImageResponse` fetch of
  `image.tmdb.org/t/p/w1280/<file>` (absolute, via `tmdbImageUrl()`, bypassing the
  `/img` proxy) gets an explicit timeout → fall through to poster → existing
  gradient placeholder, so the route always returns `200 image/png`. Apply the
  `SAFE_PATH` regex to the file segment before fetching (defense-in-depth parity
  with the proxy).
- **Non-Latin titles:** the app localises (Arabic etc.); load a Unicode-covering
  font via `fonts` in `ImageResponse` so titles don't render as tofu.

### Metadata (`generateMetadata`)

Next's metadata merge **replaces nested objects wholesale**, so:

- `openGraph`: per-title `title`, `description`, `url`, **plus** re-declared
  `type: 'website'`, `siteName: 'Natter'`, `locale: 'en_GB'` (else inherited ones
  are dropped).
- `twitter`: **must** set `{ title, description, card: 'summary_large_image' }` —
  otherwise X falls back to the root layout's generic site title/description
  (twitter:* outrank og:* on X).
- `alternates: { canonical: '/title/${kind}/${id}' }` for a real `rel=canonical`.
- The file-based `opengraph-image.js` auto-injects `og:image` + `twitter:image`.

## Share button UX

Always-discoverable share affordance, but placement tuned per surface to respect
existing interaction grammar:

- **PosterCard:** the play affordance lives in a hover-reveal scrim
  (`opacity:0` until `:hover`). Put share in that scrim on desktop **and** make it
  always-visible on touch (no hover); keep the footer to one trailing control on
  the narrowest 2-col breakpoints so the provider row isn't crushed.
- **Billboard:** a round `IconButton` (like the existing `+`), not a 4th labelled
  `lg` button (which would wrap the row).
- **DetailModal:** wire the **existing** Share button (`DetailModal.jsx:125`,
  currently a no-op) to the same handler — the detail view is the most natural
  place to share, and this kills dead UI.

Behaviour: `navigator.share(url, title)` where available (mobile native sheet) →
else copy URL to clipboard. Confirmation via an **`aria-live`** region (announced
to SR/keyboard users) — either a small toast component or a transient button-text
swap ("Link copied"); on desktop this is the *only* feedback, so it must be
unmissable and announced. `shareUrlFor(pick)` returns null when `tmdbId` is absent
→ the button does not render (no `/title/film/undefined`).

## Testing

- **Unit (node:test):** `shareUrlFor({tmdbId, kind})` → `/title/film/693134`, and
  `shareUrlFor` with no `tmdbId` → null; `tmdbImageUrl('/img/w1280/x.jpg')` →
  `https://image.tmdb.org/t/p/w1280/x.jpg` (in `tests/tmdb.test.js`). The
  `getDetails` id/kind/season validation tests already landed.
- **Wire the runner:** any new `tests/*.test.js` must be appended to
  `package.json`'s `test` script or it won't run.
- **Preview verification:** `curl -A 'facebookexternalhit/1.1' /title/film/693134`
  (a bot UA forces metadata into `<head>`; a plain curl streams it into `<body>`)
  → assert `og:image`, `og:title`, `twitter:title` = the film title (not the site
  tagline); `curl /title/film/693134/opengraph-image` → `200 image/png`; invalid
  id/kind → 404.

## Out of scope (v1)

- Readable URL slug; "more like this" on the landing page; multi-pick share;
  watchlist/account features.
- Poster-as-OG-background fallback is **kept** but flagged: a portrait poster
  object-fit-cover'd into 1200×630 looks cropped — if a quick check shows
  recommended titles routinely have backdrops, drop it and fall straight to the
  gradient.

## Nice-to-have / decisions

- **Share analytics:** log a `logUsage({route:'share-landing'})` line on the page
  render (reuses existing infra, makes the conversion goal measurable). Cheap —
  recommend including; if skipped, it's a conscious decision.
- `app/sitemap.js` + `app/robots.js` so the crawlable landing pages have a
  discovery path (follow-up, not v1-blocking).

## Next 16 implementation notes

Per `AGENTS.md`, read `node_modules/next/dist/docs/` before coding. Confirmed by
the council against this version (16.2.9): route `params` is a Promise
(`const { kind, id } = await params`, as in `app/img/[...path]/route.js:18`);
file-based `opengraph-image.js` in a dynamic `[kind]/[id]` segment receives both
params; `generateMetadata` + `next/og` remote-image fetch are supported;
`metadataBase` (app/layout.jsx) resolves og:image/canonical to absolute. Cache
Components / `dynamicIO` are off, so no Suspense-wrapping of `params` is required.
