# Wave 2 — Domain recommendation engine + API routing

Repo: Natter, Next.js 16 App Router, plain JS/ESM, `@/*`=repo root. Wave 1 already created `lib/providers/{books,games,recipes,index}.js` exporting per-domain `{ domain, label, accent, search, getDetails, normalizeToPick }`, plus `PROVIDERS`, `NEW_DOMAINS=['book','game','recipe']`, `getProvider`, `DOMAIN_META` (all 5 domains). READ those files first.

## The seam (already decided — do NOT refactor lib/agent.js)
`kind` IS the domain selector. Existing values `all|film|tv` keep the battle-tested TMDB `recommend()` path UNTOUCHED. New values `book|game|recipe` route to a NEW lightweight engine. Cache key is already `query|kind` (lib/recCache.js) — works as-is.

## Files to create

### `lib/llm.js` — shared MiniMax client (extracted so we don't touch agent.js)
```js
import OpenAI from 'openai';
let _c;
export function getLLM(){ if(!_c) _c=new OpenAI({apiKey:process.env.MINIMAX_API_KEY, baseURL:process.env.MINIMAX_BASE_URL||'https://api.minimax.io/v1'}); return _c; }
export const LLM_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2';
```
(Do NOT edit agent.js to use this — leave agent.js exactly as is.)

### `lib/domainClassify.js` — verb/keyword domain router (pure, no I/O)
Export `classifyDomain(query, selectedKind)` → `{ domain, switched, from }`.
- Signals (case-insensitive word/substring match):
  - book:  book, novel, read, reading, author, paperback, hardback, memoir, fiction, non-fiction, audiobook, bookshelf, chapter
  - game:  game, video game, play (as verb), gaming, xbox, playstation, ps5, ps4, nintendo, switch, steam, multiplayer, co-op, rpg, fps, roguelike
  - recipe: recipe, cook, cooking, bake, baking, dinner, lunch, breakfast, meal, dish, eat, cuisine, ingredient, vegan recipe, what to make, what to cook
  - screen: movie, film, watch, show, series, season, cinema, netflix, tv
- Rule: compute the strongest-signal domain (count keyword hits; "play"/"watch"/"read"/"cook" verbs weight x2). If `selectedKind` ∈ NEW_DOMAINS or film/tv/all:
  - If a DIFFERENT domain has a STRONG signal (>=2 weighted hits OR an explicit domain noun like "novel"/"recipe"/"video game"), override → that domain, `switched:true, from:selectedKind`.
  - Else keep `selectedKind` (→ domain = selectedKind, switched:false). For all/film/tv with no new-domain signal, return domain=selectedKind unchanged.
- Never override INTO film/tv/all from a new domain unless a strong screen signal appears.
Keep it deterministic and well-commented. This is unit-tested heavily.

### `lib/domainRecommend.js` — the new engine (mirrors recommend()'s streaming contract)
Signature: `export async function domainRecommend({ query, domain, onStep, onCandidates, onPartial, excludeIds, llm, providerOverride })`
- `llm` and `providerOverride` are optional injection points for tests (default: real getLLM() / getProvider(domain)).
- Returns `{ intent, kind: domain, picks, providers: [], lang: null }` — SAME shape `buildDonePayload` consumes.
Flow:
1. `onStep('Understanding your request')`. provider = providerOverride || getProvider(domain).
2. **Plan call** (LLM JSON): system="You plan a {domain} search. Return JSON {searchTerms:[2-4 strings], filters:{...}, intent:'one short sentence'}". user=query. Parse defensively; on any failure fall back to `{ searchTerms:[query], filters:{}, intent:query }`. Use `response_format:{type:'json_object'}` if supported, else parse from content. For games, if provider throws code:'NO_KEY' anywhere, catch and fall back to a Brave-web-search candidate list (import braveSearch from lib/brave.js) → synthesize minimal picks (title from result, image null) so the domain still returns something; mark intent noting limited data.
3. **Fetch candidates**: `provider.search` for each searchTerm in parallel (Promise.allSettled), flatten, dedupe by id, drop excludeIds. Emit `onCandidates(picks.slice(0,12).map(p=>({id:p.id,title:p.title,image:p.image})))` as they resolve, and one `onPartial({kind:domain, intent, picks: top8, phase:'partial'})`.
4. If recipe and picks are partial (meta.partial), hydrate top 12 via `provider.getDetails(sourceId)` (allSettled).
5. If <3 candidates, do one broadening `provider.search({query, limit:20})`.
6. `onStep('Picking the best for you')`. **Rank call** (LLM JSON): give compact candidates `[{id,title,subtitle,year,rating, note:<short meta>}]`, ask to return `{picks:[{id, reason:'1 specific sentence', match: 60-99}]}` choosing up to 15 best, ordered. Parse defensively; fallback = first 12 candidates by rating with generic reasons.
7. Map chosen ids back to full picks, attach reason+match, badge: index0→'Top pick', year===CURRENT_YEAR→'New'. Dedupe by title. Slice 15.
8. Return the shape. Wrap whole thing so it NEVER throws to the route — on hard failure return `{intent:'', kind:domain, picks:[], providers:[], lang:null}`.

### Edit `app/api/recommend/route.js` (surgical)
- import `{ classifyDomain }`, `{ NEW_DOMAINS }`, `{ domainRecommend }`.
- Accept kind values including book|game|recipe (the current `kind = body.kind || 'all'` already passes them through — just don't reject).
- After query validated: `const routed = classifyDomain(query, kind); const finalKind = routed.domain;`
  - IMPORTANT: only let the classifier CHANGE kind when `routed.switched` is true. Use `finalKind` for cache key + branching + done payload.
- Branch inside the stream `start()`:
  - if `NEW_DOMAINS.includes(finalKind)`: call `domainRecommend({query, domain:finalKind, onStep, onCandidates, onPartial, excludeIds})`, then `const done = buildDonePayload(query, result); done.switched = routed.switched ? routed.from : undefined; emit(done);` (and cache like the existing path). SKIP the streaming-provider hydration + trakt stuff (movie-only).
  - else: existing path EXACTLY as today (pass `kind: finalKind`).
- cacheKey = recCacheKey(query, finalKind).
- Keep all existing rate-limit, logging, error handling. New domains are anonymous-cacheable.

## Tests — `tests/domain.test.js` (node:test, ESM, NO network)
- classifyDomain: ≥18 cases — "recommend a cozy mystery novel"→book; "something to play with friends"→game; "what should I cook for dinner"→recipe; "movies like Interstellar" on kind=all→stays all; "a good sci-fi novel" while kind=film → switched book from film; plain "something cozy" on kind=recipe → stays recipe; etc. Assert domain + switched + from.
- domainRecommend with injected `llm` (fake returning canned plan+rank JSON) and `providerOverride` (fake search/getDetails returning fixtures): assert ≥3 picks, each has reason (non-empty) + match (number) + domain + image-or-null, ordered, badge on index0='Top pick'. Test the recipe hydrate path and the <3 broaden path. Test the hard-failure path returns empty picks (no throw).
- Build a tiny fake llm: `{ chat:{ completions:{ create: async()=>({choices:[{message:{content: JSON.stringify(...)}}]}) } } }` matching how domainRecommend calls it — design domainRecommend to call `llm.chat.completions.create(...)`.

## Acceptance (must pass)
```
node --experimental-vm-modules --test tests/domain.test.js          # all pass
node --experimental-vm-modules --test tests/*.test.js               # ALL prior + new pass, fail 0 (movie path regression guard — critical)
npx eslint lib/ app/api/recommend/route.js tests/domain.test.js     # clean
node -e "import('./lib/domainClassify.js').then(m=>console.log(m.classifyDomain('a good sci-fi novel','film')))"  # {domain:'book',switched:true,from:'film'}
```
The movie/TV path MUST stay green (don't break existing tests). Report pass/fail per item with exact numbers, and any spec deviations.
