# Wave 1 — Domain provider layer (Books, Games, Recipes)

You are working in the Natter repo (Next.js 16 App Router, **plain JS/ESM**, `"type":"module"`, `@/*` path alias = repo root). NO TypeScript. Match existing style in `lib/` (look at `lib/tmdb.js`, `lib/brave.js`, `lib/providers.js` for conventions: named exports, `fetch`, small helpers, JSDoc-ish comments).

## IMPORTANT: cache.js exports note
lib/cache.js exports `cacheGetJSON` and `cacheSetJSON` (NOT `cacheGet`/`cacheSet`). Per the spec, since the API differs from what the spec expected, **skip caching entirely** — do not import from lib/cache.js. Correctness over cleverness.

## Goal
Create a pluggable domain-provider layer so the recommendation engine can serve **books, games, recipes** without knowing each API. Each provider normalizes its API into a unified pick shape. This wave is **pure lib + tests only** — do NOT touch the agent, API routes, or UI yet.

## Unified pick shape (the contract every provider's `normalizeToPick` must return)
```js
{
  id: `${domain}:${sourceId}`,   // e.g. 'book:zyTCAlFPjgYC'
  domain: 'book'|'game'|'recipe',
  sourceId: String,
  title: String,
  subtitle: String,              // author(s) / studio / cuisine — '' if unknown
  year: Number|null,
  rating: Number|null,           // 0-10 scale (normalize! Google 0-5 -> *2; RAWG 0-5 -> *2; metacritic 0-100 -> /10)
  image: String|null,            // absolute cover/screenshot URL (proxy later, store raw here)
  reason: '',                    // filled by the agent later, keep ''
  match: null,                   // filled by the agent later
  meta: { ...domainSpecific }    // see below
}
```
Domain-specific `meta`:
- book:   `{ authors:[String], pageCount:Number|null, categories:[String], description:String, publisher:String, language:String, previewLink:String }`
- game:   `{ platforms:[String], genres:[String], metacritic:Number|null, released:String, description:String, screenshots:[String] }`
- recipe: `{ area:String, category:String, ingredients:[{name,measure}], instructions:String, tags:[String], youtube:String, source:String }`

## Files to create

### `lib/providers/books.js` — Google Books API
- Base: `https://www.googleapis.com/books/v1/volumes`
- `search({ query, limit=20, filters={} })`: GET `?q={encoded query}&maxResults={limit}&printType=books&orderBy=relevance` + `&key=${process.env.GOOGLE_BOOKS_API_KEY}` ONLY if the env var is set (works keyless). If `filters.subject` set, prepend `subject:` to q. Returns array of normalized picks.
- `getDetails(sourceId)`: GET `/{sourceId}` → normalized pick.
- `normalizeToPick(volume)`: volume.volumeInfo has `title, subtitle, authors[], publishedDate('YYYY' or 'YYYY-MM-DD'), description, pageCount, categories[], averageRating(0-5), imageLinks.thumbnail, publisher, language, previewLink`. year = parseInt(publishedDate.slice(0,4)). image = imageLinks.thumbnail (force https). rating = averageRating ? round(averageRating*2,1) : null. subtitle = authors.join(', ').
- Export `{ domain:'book', label:'Books', accent:'#E8A94B', search, getDetails, normalizeToPick }`.

### `lib/providers/games.js` — RAWG API
- Base: `https://api.rawg.io/api/games`. Requires `process.env.RAWG_API_KEY`. If absent, `search`/`getDetails` throw a tagged error `Object.assign(new Error('RAWG_API_KEY missing'), { code:'NO_KEY' })` (caller handles fallback).
- `search({ query, limit=20, filters={} })`: GET `?key={KEY}&search={q}&page_size={limit}&search_precise=true`; if `filters.genres` add `&genres=`, if `filters.ordering` add `&ordering=` (default `-rating`), if `filters.dates` add `&dates=`. Map `results[]`.
- `getDetails(sourceId)`: GET `/{sourceId}?key={KEY}` → has `description_raw`. Merge into meta.description.
- `normalizeToPick(g)`: `{ id, name, released('YYYY-MM-DD'), rating(0-5), metacritic(0-100), background_image, genres[{name}], platforms[{platform:{name}}], short_screenshots[{image}] }`. year=parseInt(released). rating = metacritic ? round(metacritic/10,1) : (g.rating?round(g.rating*2,1):null). subtitle = genres.map(name).slice(0,2).join(', '). image=background_image. meta.platforms = platforms.map(p=>p.platform.name). meta.screenshots = (short_screenshots||[]).map(s=>s.image).
- Export `{ domain:'game', label:'Games', accent:'#5BC8AF', search, getDetails, normalizeToPick }`.

### `lib/providers/recipes.js` — TheMealDB
- Base: `https://www.themealdb.com/api/json/v1/${process.env.THEMEALDB_KEY || '1'}`.
- `search({ query, limit=20, filters={} })`:
  - If `filters.category` → GET `/filter.php?c={cat}`; if `filters.area` → `/filter.php?a={area}`; if `filters.ingredient` → `/filter.php?i={ing}`; else → `/search.php?s={query}`.
  - `/search.php` returns full meals; `/filter.php` returns ONLY `{idMeal,strMeal,strMealThumb}` (partial). Slice to `limit`. Mark partial picks (meta.partial=true) so the caller can lazily `getDetails`.
  - Map `meals[]` (may be null → return []).
- `getDetails(sourceId)`: GET `/lookup.php?i={sourceId}` → meals[0] full.
- `normalizeToPick(m)`: full meal has `idMeal, strMeal, strCategory, strArea, strInstructions, strMealThumb, strYoutube, strSource, strTags`, and `strIngredient1..20` + `strMeasure1..20`. Build ingredients = pairs where strIngredientN is non-empty/non-null trimmed → `{name, measure}`. year=null. rating=null. subtitle = strArea ? `${strArea} · ${strCategory}` : strCategory. image=strMealThumb. tags = strTags? strTags.split(',').map(t=>t.trim()):[].
- Export `{ domain:'recipe', label:'Recipes', accent:'#F2766B', search, getDetails, normalizeToPick }`.

### `lib/providers/index.js` — registry
```js
import * as book from './books.js';
import * as game from './games.js';
import * as recipe from './recipes.js';
export const PROVIDERS = { book, game, recipe };
export const NEW_DOMAINS = ['book','game','recipe'];
export function getProvider(domain) { return PROVIDERS[domain] || null; }
// Domain display metadata used by UI + agent (single source of truth)
export const DOMAIN_META = {
  film:   { label:'Films',   accent:'#7C6CFF', verb:'watch' },
  tv:     { label:'TV',      accent:'#7C6CFF', verb:'watch' },
  book:   { label:'Books',   accent:'#E8A94B', verb:'read'  },
  game:   { label:'Games',   accent:'#5BC8AF', verb:'play'  },
  recipe: { label:'Recipes', accent:'#F2766B', verb:'cook'  },
};
```

## Networking rules
- Use global `fetch`. Add a 12s `AbortController` timeout per request. On non-ok response throw `Error('<provider> <status>')`. Wrap parse defensively.
- **Skip caching** — lib/cache.js exports differ from expected (see note above). Do not import from lib/cache.js.

## Tests — create `tests/providers.test.js` (node:test, ESM)
Match the style of existing `tests/tmdb.test.js`. Do NOT hit the network: stub `globalThis.fetch` with canned JSON fixtures per provider, then assert:
- `books.normalizeToPick(fixture)` returns the exact unified shape, rating normalized 0-10, id `book:...`, subtitle = joined authors.
- `games.normalizeToPick(fixture)` maps metacritic→rating/10, platforms/screenshots arrays, id `game:...`.
- `recipes.normalizeToPick(fixture)` builds ingredients pairs correctly (skips empty slots), subtitle area·category, id `recipe:...`.
- `games.search` throws `code:'NO_KEY'` when `RAWG_API_KEY` unset.
- `getProvider('book')` returns the module; `getProvider('nope')` returns null; `DOMAIN_META` has all 5 domains.
Restore `globalThis.fetch` in afterEach.

## Acceptance (run these, must pass)
```
node --experimental-vm-modules --test tests/providers.test.js   # all pass
node --experimental-vm-modules --test tests/*.test.js           # >=499 prior tests still pass, 0 fail
npx eslint lib/providers/ tests/providers.test.js               # clean
```
Do not modify any file outside `lib/providers/` and `tests/providers.test.js`. Report what you created + the test counts.
