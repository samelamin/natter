# Wave 3 — Multi-domain UI redesign

Repo: Natter, Next.js 16 App Router, plain JS/JSX, custom CSS token system (NO Tailwind). `@/*`=repo root. Waves 1+2 done: `lib/providers/*` exports `DOMAIN_META` (film/tv/book/game/recipe, each `{label,accent,verb}`) + `NEW_DOMAINS=['book','game','recipe']`. The recommend stream now returns picks shaped:
`{ id, domain:'book'|'game'|'recipe', title, subtitle, year|null, rating|null, image, reason, match, badge?, meta:{...} }` for new domains. Existing film/tv picks keep `{kind,title,year,runtime,rating,poster,reason,match,badge,on,...}`. The `done` event may carry `switched:<fromKind>` when the classifier auto-switched domains.

GOAL: make the whole UI multi-domain. Selected `kind` now spans `all|film|tv|book|game|recipe`. Each new domain renders with its own accent + domain-appropriate metadata. **Do NOT change movie/TV rendering behavior** — only generalize so new domains also work.

READ FIRST: `components/screens/TopBar.jsx`, `components/screens/IdleScreen.jsx`, `components/screens/ResultsScreen.jsx`, `components/screens/DetailModal.jsx`, `components/natter/index.jsx` (PosterCard/Billboard/Backdrop), `components/natter/Icons.jsx`, `lib/suggestionPool.js`, `app/page.jsx`. Match existing style exactly.

## 1. Icons — `components/natter/Icons.jsx`
Add three inline SVG icons matching the existing set's style (stroke/size conventions): `book`, `gamepad`, `chef` (chef hat / cooking pot). Keep them visually consistent with `film`/`tv`.

## 2. TopBar selector — `components/screens/TopBar.jsx`
Expand `KIND_OPTS` to 6:
```
{value:'all',   label:'Everything', icon:<Icons.layers/>}
{value:'film',  label:'Films',      icon:<Icons.film/>}
{value:'tv',    label:'TV',         icon:<Icons.tv/>}
{value:'book',  label:'Books',      icon:<Icons.book/>}
{value:'game',  label:'Games',      icon:<Icons.gamepad/>}
{value:'recipe',label:'Recipes',    icon:<Icons.chef/>}
```
The SegmentedToggle must stay usable at 6 items (let it wrap/scroll on narrow screens — add CSS if needed, don't break mobile). `showFilter` should be true on idle + results screens.

## 3. Per-domain accent
Import `DOMAIN_META` from `@/lib/providers/index.js`. In `app/page.jsx`, compute the active accent from `kind` (fallback to film accent for all) and set it as a CSS custom property on the app root wrapper: `style={{ '--accent': accent, '--accent-domain': accent }}`. The existing `--accent` is used by buttons/cards — overriding it per-domain tints the whole result view. Default/Everything = the existing iris `#7C6CFF` (do not change film/tv look).

## 4. Suggestion pools — `lib/suggestionPool.js`
Keep `POOL` (back-compat) and ADD `POOL_BY_DOMAIN`:
```
export const POOL_BY_DOMAIN = {
  all:  POOL,
  film: POOL,
  tv:   ['A bingeable mystery series', 'Something like Succession', 'A cosy sitcom', 'Prestige sci-fi', 'A limited series under 8 eps', ...],
  book: ['A cosy mystery novel', 'Sci-fi like Dune', 'A short literary novel', 'A page-turning thriller', 'Feel-good non-fiction', 'A modern fantasy epic'],
  game: ['A relaxing cozy game', 'Co-op games for two', 'A story-rich RPG', 'Something like Hollow Knight', 'A short indie gem', 'Couch multiplayer'],
  recipe: ['A quick weeknight dinner', 'Something with chicken', 'A cosy vegetarian stew', 'A 20-minute pasta', 'Healthy meal-prep', 'A showstopper dessert'],
};
```
(Fill the TV list with 6 real entries.)

## 5. IdleScreen — `components/screens/IdleScreen.jsx`
- Accept a `kind` prop. Pick chips from `POOL_BY_DOMAIN[kind] || POOL`.
- Hero copy per domain via a small map: eyebrow + title.
  - all/film: keep current "Movie night, sorted" / "What are you in the mood for?"
  - tv: "Your next binge" / "What do you want to watch?"
  - book: "Your next great read" / "What do you want to read?"
  - game: "Your next obsession" / "What do you want to play?"
  - recipe: "What's for dinner?" / "What do you want to cook?"
- Placeholder + hint text per domain (e.g. recipe: "Tell me what you're craving…"). Keep the mic hint line generic.
- Keep hydration-safe pattern (chips from `kind` pool's first 5, randomize after mount). When `kind` changes, refresh chips.

## 6. PosterCard + Billboard — `components/natter/index.jsx` (generalize, don't break film/tv)
- Image source: `item.posterSrc || item.poster || item.image`.
- Add a domain-aware meta builder. When `item.domain` ∈ {book,game,recipe} (or `item.kind` absent):
  - Show `item.subtitle` as a secondary line under the title (author/studio/cuisine).
  - Meta row per domain: book → `item.meta.pageCount ? '<n> pages' : null` + year; game → first 2 `item.meta.platforms` + (`item.meta.metacritic` as a small badge) ; recipe → `item.meta.category` + `item.meta.area`.
  - Foot label: replace the `'Film'/'TV Series'` text with the domain label ('Book'/'Game'/'Recipe'); DO NOT render the streaming-provider row (`item.watch`/`item.on`) for new domains.
  - **Hide the add-to-watchlist button** for new domains (book/game/recipe) in PosterCard, Billboard, AND DetailModal — watchlist is movie/TV-only in v1 (the watchlist store is integer-tmdb keyed). Film/TV keep their save button. Share button stays for all domains.
  - `rating` may be null → guard (already guarded). `year` may be null → omit.
- Film/TV path must render EXACTLY as before (keep the existing branches; only add an `else`/domain branch).
- Billboard: same image fallback + subtitle + domain meta; the primary button for new domains says the domain verb: book→"View book", game→"View game", recipe→"View recipe" (use `item.reason ? ... : 'Take a look'`); never show "Watch on …" for new domains.

## 7. ResultsScreen — `components/screens/ResultsScreen.jsx`
- Filter: `const shown = (picks||[]).filter(p => kind==='all' || p.kind===kind || p.domain===kind);`
- Empty-state copy per domain ("No books in this set — try another search.").
- The "Only what you can watch on …" provider note: render ONLY when kind is film/tv/all (skip for new domains).
- Hero billboard + grid logic otherwise unchanged.

## 8. DetailModal — `components/screens/DetailModal.jsx`
- If `item.domain` ∈ {book,game,recipe}: DO NOT call `/api/title` (that's TMDB-only). Render directly from the pick:
  - Header: image, title, subtitle, year/rating if present, MatchScore, reason ("Why this pick").
  - book: `meta.description` (synopsis), a definition list with Author(s), Pages, Categories, Publisher; a "Preview" link to `meta.previewLink` if present.
  - game: `meta.description`, dl with Platforms, Genres, Metacritic, Released; a screenshots row from `meta.screenshots` (reuse StillsRow style or a simple img row).
  - recipe: **prominently list ingredients** (`meta.ingredients` = `[{name,measure}]`) as a clean list, then `meta.instructions` (split on newlines into steps), dl with Cuisine(area)/Category, a "Watch on YouTube" link (`meta.youtube`) + source link if present.
- Film/TV path unchanged (keep the existing `/api/title` fetch + render).

## 9. page.jsx wiring — `app/page.jsx`
- `pageState` currently `{all:1,film:1,tv:1}` → add `book:1,game:1,recipe:1` (or make it default to 1 for any key).
- In `applyEvent`, for `partial` and `done`: `setKind(event.kind || 'all')` must now accept new domains (remove the `=== 'film' || === 'tv'` clamp so book/game/recipe land correctly). 
- On `done`, if `event.switched`: `setToast('Switched to ' + (DOMAIN_META[event.kind]?.label || event.kind))` (reuse existing toast state/UI). Import DOMAIN_META.
- Pass `kind` into `<IdleScreen kind={kind} .../>`.
- The TopBar `setKind` handler should set kind for the NEXT search (it already does); when changed on idle, IdleScreen chips/copy update.

## 10. CSS — add `styles/domains.css`, import it from `app/globals.css`
- Optional small rules: `.nat-poster__subtitle` (muted secondary line), recipe ingredient list, screenshots row, metacritic badge, 6-item segmented toggle wrap/scroll on mobile. Reuse existing tokens (`--text-mid`, `--surface-raised`, etc). Keep it minimal + on-theme (dark, cinematic).

## Acceptance (must pass)
```
cd /home/ubuntu/natter-multidomain
npm run build              # MUST succeed (Next build compiles all routes) — this is the primary gate
npx eslint app/ components/ lib/suggestionPool.js   # clean
node --experimental-vm-modules --test tests/*.test.js | grep -E "^# (pass|fail)"   # >=547 pass, fail 0 (no test regressions)
```
Also sanity-check no import cycles and that `DOMAIN_META` import in a `'use client'` file is OK (it's a plain const object — fine).
Do NOT touch lib/agent.js, lib/providers/*, lib/domainRecommend.js, the Stremio addon, or API routes other than reading them. Report files changed + build result.
