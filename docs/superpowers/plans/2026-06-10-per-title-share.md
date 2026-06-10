# Per-title share — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sharing a single recommendation produces a per-title link that unfurls a cinematic OG card and lands on a real `/title/[kind]/[id]` page.

**Architecture:** A server-rendered route reads `getDetails()` (already input-validated) and renders the title via the existing client presentational components (which SSR to HTML). A sibling file-based `opengraph-image.js` renders the cinematic card. A small client `ShareButton` builds the URL with a pure `shareUrlFor` helper and uses Web Share → clipboard.

**Tech Stack:** Next 16 App Router (server components, `generateMetadata`, file-based `opengraph-image`, `next/og`), node:test.

**Spec:** `docs/superpowers/specs/2026-06-10-per-title-share-design.md` (council-reviewed).

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/share.js` | create | `shareUrlFor(pick)` — pure, client-safe (no tmdb/env/og imports) |
| `lib/tmdb.js` | modify | add `tmdbImageUrl(path)` next to `img()` (its inverse) |
| `components/natter/ShareButton.jsx` | create | client: Web Share → clipboard + `aria-live` confirm |
| `components/natter/index.jsx` | modify | mount `ShareButton` in `PosterCard` scrim + `Billboard` btns |
| `components/screens/DetailModal.jsx` | modify | wire the existing dead Share button (line 125) |
| `app/title/[kind]/[id]/page.jsx` | create | server: validate, getDetails, render, `generateMetadata` |
| `app/title/[kind]/[id]/loading.jsx` | create | skeleton + CTA |
| `app/title/[kind]/[id]/opengraph-image.js` | create | `next/og` cinematic card + cache header |
| `tests/share.test.js` | create | `shareUrlFor` units (+ add to package.json) |
| `tests/tmdb.test.js` | modify | `tmdbImageUrl` units |

---

## Task 1: `shareUrlFor` helper

**Files:** Create `lib/share.js`, `tests/share.test.js`; Modify `package.json`.

- [ ] **Step 1: Write the failing test** — `tests/share.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareUrlFor } from '../lib/share.js';

test('shareUrlFor: film', () => assert.equal(shareUrlFor({ tmdbId: 693134, kind: 'film' }), '/title/film/693134'));
test('shareUrlFor: tv', () => assert.equal(shareUrlFor({ tmdbId: 1396, kind: 'tv' }), '/title/tv/1396'));
test('shareUrlFor: unknown kind defaults to film', () => assert.equal(shareUrlFor({ tmdbId: 5 }), '/title/film/5'));
test('shareUrlFor: no tmdbId → null', () => assert.equal(shareUrlFor({ kind: 'film' }), null));
test('shareUrlFor: nullish pick → null', () => assert.equal(shareUrlFor(null), null));
```

- [ ] **Step 2: Wire the runner** — in `package.json`, append `tests/share.test.js` to the `test` script's file list.

- [ ] **Step 3: Run → fail.** `npm test 2>&1 | grep share` → FAIL (`Cannot find module '../lib/share.js'`).

- [ ] **Step 4: Implement** — `lib/share.js`

```js
/**
 * lib/share.js — pure share-link helpers. Client-safe: MUST NOT import
 * lib/tmdb.js, read process.env, or touch next/og (it ships in the client bundle).
 */

/**
 * Canonical share path for a pick. null when there's no tmdbId (caller hides the button).
 * @param {{ tmdbId?: number|string, kind?: 'film'|'tv' } | null} pick
 * @returns {string|null}  e.g. "/title/film/693134"
 */
export function shareUrlFor(pick) {
  if (!pick || pick.tmdbId == null) return null;
  const kind = pick.kind === 'tv' ? 'tv' : 'film';
  return `/title/${kind}/${pick.tmdbId}`;
}
```

- [ ] **Step 5: Run → pass.** `npm test 2>&1 | tail -4` → all pass.
- [ ] **Step 6: Commit.** `git commit -am "feat(share): shareUrlFor helper"`

---

## Task 2: `tmdbImageUrl` helper

**Files:** Modify `lib/tmdb.js` (next to `img()`), `tests/tmdb.test.js`.

- [ ] **Step 1: Write the failing test** — add to `tests/tmdb.test.js` (import `tmdbImageUrl` from `../lib/tmdb.js`):

```js
test('tmdbImageUrl: proxied path → absolute TMDB url', () => {
  assert.equal(tmdbImageUrl('/img/w1280/x.jpg'), 'https://image.tmdb.org/t/p/w1280/x.jpg');
});
test('tmdbImageUrl: already-absolute or other path passes through host', () => {
  assert.equal(tmdbImageUrl('/w500/y.jpg'), 'https://image.tmdb.org/t/p/w500/y.jpg');
});
test('tmdbImageUrl: null → null', () => assert.equal(tmdbImageUrl(null), null));
```

- [ ] **Step 2: Run → fail.** `npm test 2>&1 | grep tmdbImageUrl` → FAIL (not a function).
- [ ] **Step 3: Implement** — in `lib/tmdb.js`, right after `img()` (and its `IMG_BASE`):

```js
const TMDB_IMG_ORIGIN = 'https://image.tmdb.org/t/p';

/**
 * Inverse of img(): convert a proxied path ('/img/w1280/x.jpg') back to the
 * absolute TMDB CDN url, for server-side fetches (next/og) that can't use the
 * same-origin /img proxy. null for falsy input.
 */
export function tmdbImageUrl(proxied) {
  if (!proxied) return null;
  const s = String(proxied);
  const rel = s.startsWith(IMG_BASE) ? s.slice(IMG_BASE.length) : s;
  return `${TMDB_IMG_ORIGIN}${rel}`;
}
```

- [ ] **Step 4: Run → pass.** `npm test 2>&1 | tail -4`.
- [ ] **Step 5: Commit.** `git commit -am "feat(share): tmdbImageUrl (inverse of img) for OG card"`

---

## Task 3: `ShareButton` client component

**Files:** Create `components/natter/ShareButton.jsx`. (No unit test — DOM/clipboard behaviour is verified in the preview at Task 4. `IconButton` markup is `<button class="nat-ib nat-ib--{variant} nat-ib--{size}" aria-label title {...rest}>{icon}</button>`; `Icons.share` exists.)

- [ ] **Step 1: Implement** — `components/natter/ShareButton.jsx`

```jsx
'use client';

import { useState, useCallback, useRef } from 'react';
import { Icons } from './Icons.jsx';
import { shareUrlFor } from '@/lib/share.js';

/**
 * Share affordance for a pick. Native share sheet where available, else copy-link
 * with an aria-live confirmation. Renders nothing when the pick has no tmdbId.
 */
export function ShareButton({ item, variant = 'solid', size = 'md', round = false, onClick }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const path = shareUrlFor(item);

  const share = useCallback(async (e) => {
    if (e) e.stopPropagation();
    if (onClick) onClick(e);
    if (!path) return;
    const url = typeof window !== 'undefined' ? new URL(path, window.location.origin).href : path;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url });
        return;
      }
    } catch { /* user cancelled the sheet — fall through to copy */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — nothing more we can do */ }
  }, [path, item, onClick]);

  if (!path) return null;

  return (
    <button
      type="button"
      className={`nat-ib nat-ib--${variant} nat-ib--${size} ${round ? 'nat-ib--round' : ''}`}
      aria-label={copied ? 'Link copied' : `Share ${item.title}`}
      title={copied ? 'Link copied' : 'Share'}
      onClick={share}
    >
      {copied ? <Icons.check /> : <Icons.share />}
      <span aria-live="polite" className="sr-only">{copied ? 'Link copied to clipboard' : ''}</span>
    </button>
  );
}
```

- [ ] **Step 2: Add `.sr-only`** to `styles/ui.css` if absent (`grep -c sr-only styles/ui.css`); if 0, add:

```css
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
```

- [ ] **Step 3: Confirm `Icons.check` exists** (`grep -c "check:" components/natter/Icons.jsx`); if 0, use `Icons.share` for both states and drop the swap.
- [ ] **Step 4: Commit.** `git commit -am "feat(share): ShareButton client component"`

---

## Task 4: Wire ShareButton into the three surfaces

**Files:** Modify `components/natter/index.jsx`, `components/screens/DetailModal.jsx`. **Verify in preview.**

- [ ] **Step 1: Import** in `components/natter/index.jsx` top: `import { ShareButton } from './ShareButton.jsx';`
- [ ] **Step 2: PosterCard scrim** — in `.nat-poster__play` (index.jsx ~441), add beside the play `IconButton`:

```jsx
<ShareButton item={item} variant="solid" round size="lg" />
```

- [ ] **Step 3: Billboard btns** — in `.billboard__btns` (index.jsx ~395, after the watchlist `IconButton`):

```jsx
<ShareButton item={item} variant="solid" size="lg" round />
```

- [ ] **Step 4: DetailModal** — replace the dead button (DetailModal.jsx:125):
  `<IconButton variant="solid" size="lg" label="Share" icon={<Icons.share />} />`
  with `<ShareButton item={data} variant="solid" size="lg" />` (add the import; `data` carries `tmdbId`+`kind`).
- [ ] **Step 5: Verify in preview.** `preview_start` → run a search → `preview_eval` that `.nat-poster__scrim button[aria-label^="Share"]` exists and clicking copies a `/title/...` URL (read `navigator.clipboard` via a stub, or assert `aria-label` flips to "Link copied").
- [ ] **Step 6: Commit.** `git commit -am "feat(share): wire ShareButton into PosterCard, Billboard, DetailModal"`

---

## Task 5: Title landing page + loading

**Files:** Create `app/title/[kind]/[id]/page.jsx`, `app/title/[kind]/[id]/loading.jsx`. **First read** `node_modules/next/dist/docs/.../generate-metadata.md` and `.../dynamic-routes.md`.

- [ ] **Step 1: Implement `page.jsx`** (server component). `params` is a Promise. Validate `kind ∈ {film,tv}` and `id` numeric → `notFound()`. Map `film→movie` for getDetails. Gate 404 on a real `title`.

```jsx
import { notFound } from 'next/navigation';
import { getDetails } from '@/lib/tmdb.js';
import { Backdrop, RatingStars, MetaRow, CastRow, WatchOn, ShareButton, Button } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

async function load({ kind, id }) {
  if ((kind !== 'film' && kind !== 'tv') || !/^\d+$/.test(id)) return null;
  try {
    const item = await getDetails({ tmdbId: id, kind: kind === 'tv' ? 'tv' : 'movie' });
    return item && item.title ? item : null;
  } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { kind, id } = await params;
  const item = await load({ kind, id });
  if (!item) return {};
  const title = `${item.title}${item.year ? ` (${item.year})` : ''} — Natter`;
  const description = item.blurb || `Where to watch ${item.title} and more on Natter.`;
  const url = `/title/${kind}/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'Natter', locale: 'en_GB', url, title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function TitlePage({ params }) {
  const { kind, id } = await params;
  const item = await load({ kind, id });
  if (!item) notFound();
  return (
    <main className="title-page">
      <Backdrop item={item} className="title-hero">
        <div className="title-hero__meta">
          <h1>{item.title}</h1>
          <MetaRow items={[item.year, item.cert, item.runtime].filter(Boolean).map((x, i) => <span key={i}>{x}</span>)} />
          {item.rating ? <RatingStars value={item.rating} /> : null}
        </div>
      </Backdrop>
      <section className="title-body">
        <p>{item.synopsis || item.blurb}</p>
        {item.watch ? <WatchOn watch={item.watch} /> : null}
        {item.cast?.length ? <CastRow cast={item.cast} /> : null}
        <div className="title-cta">
          <ShareButton item={item} variant="solid" size="lg" />
          <Button variant="brand" size="lg" iconLeft={<Icons.search />} onClick={() => {}}>
            Get recommendations on Natter
          </Button>
        </div>
      </section>
    </main>
  );
}
```

> NOTE during impl: confirm `WatchOn` is the real export name (grep `components/natter/index.jsx`); the CTA `Button` may need to be an `<a href="/">` since this is a server component — wrap or use a small client island. Resolve before committing.

- [ ] **Step 2: Implement `loading.jsx`** — skeleton hero + the same CTA so a cold visitor sees something immediately.
- [ ] **Step 3: Verify (preview/curl).** `curl -A 'facebookexternalhit/1.1' localhost:3210/title/film/693134` → 200 + `og:image`/`og:title`/`twitter:title` = the film title; `…/title/film/abc` → 404; `…/title/banana/1` → 404.
- [ ] **Step 4: Commit.** `git commit -am "feat(share): /title/[kind]/[id] landing page + loading"`

---

## Task 6: OG image (cinematic card)

**Files:** Create `app/title/[kind]/[id]/opengraph-image.js`. **First read** `node_modules/next/dist/docs/.../opengraph-image.md` and `.../image-response.md`. Model on the existing `app/opengraph-image.js`.

- [ ] **Step 1: Implement.** Validate params; getDetails; resolve absolute backdrop via `tmdbImageUrl(item.backdropSrc)` (fall back to poster, then gradient); fetch the backdrop with a timeout; render the cinematic layout (full-bleed image, flat dark band with title + `★ rating` + genres, Natter mark); set an explicit `Cache-Control`.

```js
import { ImageResponse } from 'next/og';
import { getDetails, tmdbImageUrl } from '@/lib/tmdb.js';

export const alt = 'Natter';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function fetchOk(url, ms = 2500) {
  if (!url) return null;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); return r.ok ? url : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export default async function OG({ params }) {
  const { kind, id } = await params;
  let item = null;
  if ((kind === 'film' || kind === 'tv') && /^\d+$/.test(id)) {
    try { item = await getDetails({ tmdbId: id, kind: kind === 'tv' ? 'tv' : 'movie' }); } catch {}
  }
  const bg = (await fetchOk(tmdbImageUrl(item?.backdropSrc))) || (await fetchOk(tmdbImageUrl(item?.posterSrc)));
  // ...render: if bg → <img> full-bleed + dark band with item.title/year/rating/genres + Natter mark;
  //            else → the existing gradient+wordmark style from app/opengraph-image.js.
  return new ImageResponse(/* JSX per above */, {
    ...size,
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable' },
  });
}
```

- [ ] **Step 2: Verify.** `curl localhost:3210/title/film/693134/opengraph-image` → `200 image/png`; check `Cache-Control` header is the long one (not `max-age=0`).
- [ ] **Step 3: Commit.** `git commit -am "feat(share): per-title cinematic OG card + cache header"`

---

## Task 7: Integration + styles + final verify

- [ ] **Step 1: Styles** — add `.title-page`/`.title-hero`/`.title-cta` rules to `styles/ui.css` (reuse `.bd`/`.billboard` patterns). Verify the landing page renders in the preview at desktop + mobile widths (`preview_resize`).
- [ ] **Step 2: Full suite green** — `npm test` (153 + new share/tmdbImageUrl tests).
- [ ] **Step 3: End-to-end in preview** — run a search → click a card's share → confirm `/title/...` URL → open it → page renders + `curl …/opengraph-image` is a PNG.
- [ ] **Step 4: Commit + (on request) deploy** the new `app/title` route + `lib`/`components` changes, then add the Cloudflare cache rule for `/title/*/opengraph-image` and verify the unfurl with a bot UA against `natter.cc`.

---

## Notes / risks carried from the spec
- `lib/share.js` stays import-pure (client bundle).
- OG card **must** ship the explicit `Cache-Control` (next/og defaults to `max-age=0`) — otherwise unbounded ids are a DoS amplifier.
- `generateMetadata` must set the `twitter` block or X shows the generic site title.
- Validate `id`/`kind` at the route (404), independent of `getDetails`'s own guard.
