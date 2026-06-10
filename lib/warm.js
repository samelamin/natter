/**
 * lib/warm.js — server-only Redis cache warmer for static suggestion chips.
 *
 * warmTrendingChips() pre-populates the whole-result Redis cache for every
 * chip in POOL so the first user tap after a deploy is ~1s instead of 13–41s.
 * Fire-and-forget: the /api/warm route responds immediately; this runs async.
 *
 * Design:
 * - No-ops without REDIS_URL (local dev, CI).
 * - Lazy-imports lib/agent.js so importing warm.js at build time never pulls
 *   the agent (and its OpenAI/MiniMax client) into the bundle.
 * - Sequential + 750ms delay between chips: polite to the LLM and TMDB APIs.
 * - One chip failure never stops the rest (individual try/catch).
 * - In-flight guard: a second concurrent call returns immediately.
 * - The guard sits AFTER the cacheAvailable() check so that without Redis the
 *   no-op path resolves instantly on both concurrent calls.
 */

import { cacheAvailable, cacheGetJSON, cacheSetJSON } from './cache.js';
import { recCacheKey, buildDonePayload } from './recCache.js';
import { POOL } from './suggestionPool.js';

const REDIS_PREFIX = 'natter:rec:v1:';
const TTL_SECONDS = 21600; // 6 hours — matches the recommend route
const CHIP_DELAY_MS = 750; // politeness delay between chips

// In-flight guard — module-level flag.
// NOTE: the guard is placed AFTER the cacheAvailable() check so that two
// concurrent calls on a no-Redis env both see the no-op path and resolve with
// { reason: 'no redis' } rather than one getting 'already running'.
let _running = false;

/**
 * Pre-warm the Redis whole-result cache for every static chip in POOL.
 *
 * Returns { warmed, skipped, reason? }:
 *   reason: 'no redis'       — REDIS_URL is unset (safe no-op).
 *   reason: 'already running' — another warm is already in progress.
 *   warmed / skipped         — counts from a completed warm pass.
 *
 * NEVER throws — all errors are caught internally so callers can fire-and-forget.
 */
export async function warmTrendingChips() {
  // No-op without Redis (local dev, CI, any env without REDIS_URL).
  // Guard is BELOW this check — both concurrent calls see the no-op on no-Redis.
  if (!cacheAvailable()) {
    return { warmed: 0, skipped: 0, reason: 'no redis' };
  }

  // In-flight guard: second overlapping call returns immediately.
  if (_running) {
    return { warmed: 0, skipped: 0, reason: 'already running' };
  }
  _running = true;

  let warmed = 0;
  let skipped = 0;

  try {
    // Lazy-import so merely importing lib/warm.js never pulls lib/agent.js at
    // build time. Mirror the pattern in app/api/recommend/route.js.
    const { recommend } = await import('./agent.js');

    for (const chip of POOL) {
      const key = REDIS_PREFIX + recCacheKey(chip, 'all');

      // Skip if already cached — don't waste an agent run.
      if ((await cacheGetJSON(key)) !== null) {
        skipped++;
        continue;
      }

      try {
        // recommend() accepts optional callbacks (onStep, onCandidates, onPartial).
        // The function guards every callback with `if (onStep) onStep(...)` etc.,
        // so passing no callbacks is safe — they default to undefined and are
        // never called.
        const result = await recommend({ query: chip, kind: 'all' });
        if (result?.picks?.length) {
          cacheSetJSON(key, buildDonePayload(chip, result), TTL_SECONDS);
          warmed++;
        }
      } catch (e) {
        console.warn('[warm] chip failed:', chip, e?.message);
        // One failure never stops the rest — continue to the next chip.
      }

      // Politeness delay between chips (skip after the last one).
      if (chip !== POOL[POOL.length - 1]) {
        await new Promise((r) => setTimeout(r, CHIP_DELAY_MS));
      }
    }
  } catch (e) {
    // Outer catch: any unexpected error (e.g. agent import failure) must not
    // surface to callers — they fire-and-forget.
    console.warn('[warm] unexpected error:', e?.message);
  } finally {
    _running = false;
  }

  return { warmed, skipped };
}
