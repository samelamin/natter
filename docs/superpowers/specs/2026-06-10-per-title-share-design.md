# Per-title share — design

**Status:** approved design, pending spec review
**Date:** 2026-06-10

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

- `kind` is `film` | `tv` (matches the app's `pick.kind`); mapped to TMDB
  `movie`/`tv` internally. Required because TMDB ids are **not** unique across
  film and TV.
- A readable trailing slug (`…/dune-part-two`) is explicitly **out of scope for
  v1** — easy to add later without breaking the id-based route.

## Components

| Unit | File | Type | Responsibility |
|------|------|------|----------------|
| Landing page | `app/title/[kind]/[id]/page.jsx` | server | Render the title's detail + soft CTA; `generateMetadata()` |
| OG card | `app/title/[kind]/[id]/opengraph-image.js` | server (`next/og`) | 1200×630 cinematic card for crawlers |
| Share helpers | `lib/share.js` | pure | `shareUrlFor(pick)`, `tmdbTypeFromKind(kind)`, `tmdbImageUrl(path)` |
| Share button | `components/natter/ShareButton.jsx` | client | Web Share API + copy-link fallback + toast |
| Wiring | `components/natter/index.jsx` | client | Mount `ShareButton` in `PosterCard` + `Billboard` |

Each unit is independently testable: the helpers are pure; the button is a small
client component with one job; the page/OG routes are thin wrappers over
`getDetails()`.

## Data flow

```
shared link  →  /title/film/693134
                   ├─ page.jsx  → getDetails({tmdbId:693134, kind:'film'}) → render detail + CTA
                   └─ opengraph-image.js → getDetails(...) → ImageResponse(cinematic card)
```

`getDetails()` already maps `kind==='tv' ? 'tv' : 'movie'` and has a 1-hour
in-memory cache, so the page + OG image reading it back-to-back is a single
upstream fetch. Cloudflare caches the generated card (content-hashed URL).

## The landing page (soft CTA)

A **new server-rendered layout** over the `getDetails()` shape — not the client
`DetailModal` mounted standalone. It shows: backdrop hero, title,
year · rating · cert · runtime, blurb, where-to-watch, cast, trailer. Reuse
presentational pieces from `components/natter` where they render server-side;
any interactive bit (e.g. trailer play) stays a small client island. One
tasteful CTA — a `Get recommendations on Natter →` button linking to `/`.
Visitor-first: no search box embedded on the page (the rejected "prominent
funnel" option).

Invalid `kind` or unknown `id` (getDetails throws / empty) → `notFound()` (404).

## The OG card (cinematic)

`ImageResponse`, `size = { width: 1200, height: 630 }`, `contentType: image/png`:

- Title's **w1280 backdrop**, full-bleed as the background.
- Flat dark band across the bottom carrying: title (large), then
  `year · ★ rating · genre · genre`.
- Small Natter bar-mark + wordmark, top-right.
- No backdrop available → use the **poster** as the background (portrait,
  object-fit cover) so the card is never empty.

`generateMetadata()` sets `og:title` (the title), `og:description` (blurb),
`og:url` (canonical). The file-based `opengraph-image.js` auto-injects
`og:image` + `twitter:image` with `twitter:card: summary_large_image`.

**Image-URL detail (important):** `ImageResponse` needs an **absolute** URL for
the background image and must not depend on the `/img` proxy. `getDetails()`
returns `backdropSrc` as `/img/w1280/<file>`. The OG route converts it back to
the absolute origin via `tmdbImageUrl()` →
`https://image.tmdb.org/t/p/w1280/<file>` and fetches that directly.

## Share button UX

Always-visible share icon on every `PosterCard` and the `Billboard`, beside the
existing `+` (watchlist) control. On activate:

1. If `navigator.share` exists (mostly mobile) → native share sheet with the
   `/title/[kind]/[id]` URL + title.
2. Else → copy the URL to clipboard (`navigator.clipboard`) and show a brief
   "Link copied" toast.

The button is a client component; it builds the URL with `shareUrlFor(pick)`.

## Caching / SEO

- Page is server-rendered (crawler-friendly). `getDetails` cache + Cloudflare in
  front absorb repeat hits.
- OG image URL is content-stable per title; Cloudflare caches it.
- Canonical `og:url` per title.

## Edge cases

- Unknown id / wrong kind → `notFound()`.
- No backdrop → poster fallback in both the page hero and the OG card.
- No poster either → the existing gradient + title placeholder (already in
  `Backdrop`).
- Crawler preview caching is a platform concern (validators refresh it) — not a
  code task.

## Testing

- **Unit (node:test, mock fetch where needed):**
  - `shareUrlFor({tmdbId, kind})` → `/title/film/693134`.
  - `tmdbTypeFromKind('film')` → `'movie'`, `('tv')` → `'tv'`.
  - `tmdbImageUrl('/img/w1280/x.jpg')` → `https://image.tmdb.org/t/p/w1280/x.jpg`.
- **Preview verification (no unit test for Next routes):**
  - `curl /title/film/693134` → 200, `<head>` has `og:image` + `og:title`.
  - `curl /title/film/693134/opengraph-image` → `200 image/png`.
  - Invalid id → 404.

## Out of scope (v1 / YAGNI)

- Readable URL slug.
- "More like this" recommendations on the landing page.
- Sharing a whole result set / multiple picks.
- Watchlist/account features.

## Next 16 implementation notes

Per `AGENTS.md`, read the in-repo guides (`node_modules/next/dist/docs/`) before
coding. Known specifics already used in this repo: route `params` is a Promise
(`const { kind, id } = await params;`, as in `app/img/[...path]/route.js`);
file-based `opengraph-image` + `generateMetadata` are confirmed working
(app/opengraph-image.js, app/layout.jsx).
