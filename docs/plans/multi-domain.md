# Natter Multi-Domain Expansion — Build Plan

Expand Natter from movies/TV to also recommend **Books, Games, Recipes** — all voice-driven. Redesign UI for multi-domain.

## Design consensus (Codex + Antigravity)

**Antigravity** key calls:
- Google Books > OpenLibrary (relevance, synopses, reliable covers).
- Keep RAWG for games (free key, 20k/mo, attribution); IGDB is the scale alternative.
- TheMealDB ok for MVP (key `1`); Edamam richer (dietary/calories) if needed.
- **Two-stage routing**: cheap intent router classifies domain → agent gets *generic aliased tools* (`search_catalog`/`discover`/`details`/`finalize`) mapped to the active provider. Avoids 12-tool context bloat + cross-domain confusion (Witcher game vs show).
- Pluggable `DomainProvider` interface (`search/discover/getDetails/normalizeToPick`). agent.js must NOT know specific APIs.
- UI ResultCard renders per-`domain` (no shared TMDB top-level keys; books have pageCount/author, recipes prepTime/calories — no year/runtime).
- UX: add **"Everything"** default; selected tab = soft bias; explicit cross-domain query auto-switches tab w/ toast. Verb-based intent ("play"→games, "make/cook"→recipes, "read"→books, "watch"→film/tv).

## De-risking decision (Opus)

The existing movie/TV agent (`lib/agent.js`, ~1500 lines) is battle-tested with heavy TMDB-specific post-processing (rankAndBadge, applyFilters, validatePicks, provider hydration, deep backfill, pagination categories). **Do NOT refactor it.** Instead:

- Keep `recommend()` (film/tv) untouched — movie quality is preserved.
- Add a parallel, lighter `domainRecommend()` for book/game/recipe that emits the **same NDJSON stream contract** (`step`/`candidates`/`partial`/`done`). Additive, low-risk.
- New domains share the pick *display* fields; film/tv picks get a derived `domain` for UI uniformity.

## Unified pick (display contract)

```
{ id, domain:'film'|'tv'|'book'|'game'|'recipe', sourceId,
  title, subtitle,           // subtitle = author / studio / cuisine
  year|null, rating|null, image, reason, match, badge?,
  meta:{}                    // domain-specific: {author,pageCount} {platforms,metacritic} {readyIn,calories,ingredients} }
```
Existing film/tv picks keep all current keys; add `domain` (from `kind`), `image`(=poster), `subtitle`. UI cards read the unified fields.

## Providers (`lib/providers/`)

| Domain | API | Key | Notes |
|---|---|---|---|
| book | Google Books | `GOOGLE_BOOKS_API_KEY` optional (keyless works, lower quota) | covers via books.google CDN → /img proxy |
| game | RAWG | `RAWG_API_KEY` (free); graceful Brave-fallback if absent | screenshots/metacritic |
| recipe | TheMealDB | key `1` (keyless) | ingredients + instructions |

Each exports `{ domain, label, accent, icon, search(), discover(), getDetails(), normalizeToPick() }`. Registry: `lib/providers/index.js`.

## Waves (opencode in worktree `feat/multi-domain`)

1. **Providers** — `lib/providers/{books,games,recipes,index}.js`, `/img` proxy support for external hosts, unit tests (mocked fetch → normalizeToPick shape).
2. **Domain agent + API** — `lib/domainRecommend.js` (LLM picks search terms → provider → LLM finalize w/ reasons+match; emits NDJSON). `lib/domainClassify.js` (keyword+verb router). `/api/recommend` branches on `domain`; cache key `query|domain`. Tests.
3. **UI redesign** — TopBar 6-way domain selector + per-domain accent; generalize PosterCard/Billboard/ResultsScreen → domain-aware ResultCard; DetailModal domain fields; IdleScreen + suggestionPool per-domain chips; toast on auto-switch.
4. **Persistence + polish** — relax `watchlist.kind` CHECK to include new domains; save/show new domains generically (skip trakt/providers); `.env.example` + README; full build/lint/test.
5. **Validate + ship** — `next build`, lint, 499+ tests green; Codex + Antigravity sign-off; merge to main; deploy; Telegram notify.

## Acceptance contract
- `node --experimental-vm-modules --test tests/*.test.js` ≥ 499 pass + new tests, 0 fail.
- `npm run build` clean; `npm run lint` clean.
- Each domain returns ≥3 picks for a representative voice query (mocked + live smoke).
- Movie/TV path byte-for-byte behavior unchanged (existing tests still green).
