/**
 * lib/recCache.js — the recommend route's cache key + payload shapes.
 *
 * Single source of truth shared by app/api/recommend/route.js and the Redis
 * warmer (lib/warm.js): if the warmer's key or payload drifted from the
 * route's, warmed entries would never be read. Lives outside the route file
 * because route modules only export HTTP methods + segment config.
 */

/** The whole-result cache key (the Redis key adds the 'natter:rec:v1:' prefix). */
export function recCacheKey(query, kind) {
  // Games degrade to a web-search fallback when RAWG_API_KEY is absent. Tag the
  // key with key-presence so adding the key later doesn't keep serving the
  // cached degraded results under the same key.
  let suffix = '';
  if (kind === 'game') suffix = process.env.RAWG_API_KEY ? '|rawg' : '|nokey';
  return `${query.toLowerCase()}|${kind}${suffix}`;
}

/** The exact 'done' event shape the route emits and caches. */
export function buildDonePayload(query, result) {
  return {
    type: 'done',
    query,
    intent: result.intent,
    // What the wording asked for ('film'|'tv'|'all') — the client lands
    // the toggle here; the pool itself carries both types.
    kind: result.kind,
    // Display labels of any active streaming-service filter (for the
    // "Only what you can watch on …" note in the results header).
    providers: result.providers,
    lang: result.lang,
    picks: result.picks,
  };
}
