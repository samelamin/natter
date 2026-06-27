# Wave 4 — Provider caching, env, docs, cache-version

Repo: Natter. Waves 1-3 done: multi-domain providers, domainRecommend engine, multi-domain UI. This wave is config/docs/caching polish. Small, surgical.

## 1. Provider caching — `lib/providers/{books,games,recipes}.js`
The providers currently skip caching (lib/cache.js exposes `cacheGetJSON(key)` / `cacheSetJSON(key, val, ttlSeconds)`, both graceful no-ops when Redis is absent). Add caching to each provider's `search` and `getDetails`:
- Import `{ cacheGetJSON, cacheSetJSON } from '@/lib/cache.js'`.
- Key: `prov:<domain>:<op>:<lowercased JSON of args>` (keep it short + deterministic; you can JSON.stringify the params object). TTL 21600 (6h).
- Pattern: check cache → return hit; else fetch, normalize, `cacheSetJSON(key, picks, 21600)`, return. Never let a cache error break the request (cache.js already swallows, but wrap defensively).
- This matters for RAWG's 20k/mo free quota.

## 2. Cache-version guard for games fallback — `lib/recCache.js`
Codex flagged: when `RAWG_API_KEY` is absent, games uses a degraded Brave fallback; those results would get cached under `query|game` and keep serving even after a key is added. Fix simply: in `recCacheKey(query, kind)`, when `kind === 'game'`, suffix the key with whether the key is present:
```js
export function recCacheKey(query, kind) {
  let suffix = '';
  if (kind === 'game') suffix = process.env.RAWG_API_KEY ? '|rawg' : '|nokey';
  return `${query.toLowerCase()}|${kind}${suffix}`;
}
```
Keep the existing warm.js usage working (it imports recCacheKey) — this change is backward compatible for film/tv (no suffix). Update `tests/warm.test.js` ONLY if it asserts the exact game key (most likely it doesn't — check first; do not weaken unrelated assertions).

## 3. `.env.example` — add new domain keys (all optional)
Append, with comments:
```
# ── Recommendation domains (books/games/recipes) ──────────────────────────
# Books: Google Books works keyless (lower quota); set a key for higher limits.
GOOGLE_BOOKS_API_KEY=
# Games: RAWG free API key (https://rawg.io/apidocs). WITHOUT it, games fall
# back to a limited web-search result (no covers/metacritic). Strongly recommended.
RAWG_API_KEY=
# Recipes: TheMealDB. '1' is the free public test key; leave as-is or set a Patreon key.
THEMEALDB_KEY=1
```

## 4. README — document the expansion
Update `README.md`: in the intro, change the description from movies/TV to "voice-driven recommendations for **films, TV, books, games, and recipes**." Add a short "## Domains" section listing the four content types + their data sources (TMDB, Google Books, RAWG, TheMealDB) and noting RAWG needs a free key for full game quality. Add the three new env vars to any env table/list present. Keep it concise, match the existing README tone. Note that watchlist save is currently films/TV only (books/games/recipes support voice search, results, detail, history, and sharing).

## Acceptance (must pass)
```
cd /home/ubuntu/natter-multidomain
node --experimental-vm-modules --test tests/*.test.js | grep -E "^# (pass|fail)"   # >=547 pass, fail 0
node -e "import('./lib/recCache.js').then(m=>{console.log(m.recCacheKey('x','film'));console.log(m.recCacheKey('x','game'))})"  # film: 'x|film'; game: 'x|game|nokey' (or |rawg if key set)
npx eslint lib/providers/ lib/recCache.js   # clean
npm run build   # still compiles
grep -q RAWG_API_KEY .env.example && grep -q "books\|Books" README.md && echo DOCS_OK
```
Report changed files + results. Do NOT touch UI, agent.js, domainRecommend.js logic, or the Stremio addon.
