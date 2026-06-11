/**
 * lib/warm.js — server-only Redis cache warmer for static suggestion chips.
 *
 * warmTrendingChips() pre-populates the whole-result Redis cache for every
 * chip in POOL so the first user tap after a deploy is ~1s instead of 13–41s.
 * After the static POOL pass it also warms the top dynamic trending chips for
 * key locales so the idle-screen trending suggestions are equally fast.
 * Fire-and-forget: the /api/warm route responds immediately; this runs async.
 *
 * Design:
 * - No-ops without REDIS_URL (local dev, CI).
 * - Lazy-imports lib/agent.js so importing warm.js at build time never pulls
 *   the agent (and its OpenAI/MiniMax client) into the bundle.
 * - Lazy-imports lib/trending.js AFTER the static POOL walk — it is never in
 *   the module's static import graph, so a cold build stays clean.
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

// Locales to warm for trending chips.
const TRENDING_LOCALES = ['GB', 'US'];
// Maximum chips to warm per locale from the trending feed.
const TRENDING_PER_LOCALE = 8;
// Hard cap on total trending warms across all locales in one pass.
const TRENDING_MAX_TOTAL = 16;

// In-flight guard — module-level flag.
// NOTE: the guard is placed AFTER the cacheAvailable() check so that two
// concurrent calls on a no-Redis env both see the no-op path and resolve with
// { reason: 'no redis' } rather than one getting 'already running'.
let _running = false;

/**
 * Pre-warm the Redis whole-result cache for every static chip in POOL, then
 * also warm the dynamic trending chips for key locales.
 *
 * Returns { warmed, skipped, trendingWarmed, trendingSkipped, reason? }:
 *   reason: 'no redis'        — REDIS_URL is unset (safe no-op).
 *   reason: 'already running' — another warm is already in progress.
 *   warmed / skipped          — counts from the static POOL pass.
 *   trendingWarmed / trendingSkipped — counts from the trending pass.
 *
 * NEVER throws — all errors are caught internally so callers can fire-and-forget.
 */
export async function warmTrendingChips() {
  // No-op without Redis (local dev, CI, any env without REDIS_URL).
  // Guard is BELOW this check — both concurrent calls see the no-op on no-Redis.
  // Trending import is NOT attempted here — we return before it would be reached.
  if (!cacheAvailable()) {
    return { warmed: 0, skipped: 0, trendingWarmed: 0, trendingSkipped: 0, reason: 'no redis' };
  }

  // In-flight guard: second overlapping call returns immediately.
  if (_running) {
    return { warmed: 0, skipped: 0, trendingWarmed: 0, trendingSkipped: 0, reason: 'already running' };
  }
  _running = true;

  let warmed = 0;
  let skipped = 0;
  let trendingWarmed = 0;
  let trendingSkipped = 0;

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

    // ── Trending chip pass ─────────────────────────────────────────────────
    // Lazily import trending.js AFTER the static POOL walk.  Keeping it out of
    // the static import graph means a cold build never pulls in lib/trending.js
    // (and its OpenAI + pg dependencies).  A failure here must NEVER affect the
    // static-warm return values — it is entirely wrapped in its own try/catch.
    //
    // getTrendingChips(country) calls db() which requires DATABASE_URL; without
    // it db() throws.  That throw is caught by the inner catch below and treated
    // as an empty chips list — the static warm result is unaffected.
    try {
      const { getTrendingChips } = await import('./trending.js');

      // Track which keys we already warmed this run (POOL + trending) to avoid
      // redundant calls.  Build a lower-cased set from POOL for deduplication.
      const warmedThisRun = new Set(POOL.map((c) => c.toLowerCase()));
      let trendingTotal = 0;

      for (const locale of TRENDING_LOCALES) {
        if (trendingTotal >= TRENDING_MAX_TOTAL) break;

        let chips;
        try {
          const result = await getTrendingChips(locale);
          // getTrendingChips returns { chips: string[], source: ... }
          chips = Array.isArray(result?.chips) ? result.chips : [];
        } catch (e) {
          // DATABASE_URL unset, DB unreachable, or any other failure — skip locale.
          console.warn('[warm] trending chips unavailable for locale', locale, e?.message);
          chips = [];
        }

        // Take at most TRENDING_PER_LOCALE chips, dedupe against POOL and this run.
        let localeCount = 0;
        for (const chip of chips) {
          if (localeCount >= TRENDING_PER_LOCALE) break;
          if (trendingTotal >= TRENDING_MAX_TOTAL) break;

          const lower = chip.toLowerCase();
          if (warmedThisRun.has(lower)) {
            trendingSkipped++;
            localeCount++;
            continue;
          }

          const key = REDIS_PREFIX + recCacheKey(chip, 'all');

          // Skip if already in Redis — same logic as POOL chips.
          if ((await cacheGetJSON(key)) !== null) {
            trendingSkipped++;
            localeCount++;
            warmedThisRun.add(lower);
            continue;
          }

          try {
            const result = await recommend({ query: chip, kind: 'all' });
            if (result?.picks?.length) {
              cacheSetJSON(key, buildDonePayload(chip, result), TTL_SECONDS);
              trendingWarmed++;
            }
          } catch (e) {
            console.warn('[warm] trending chip failed:', chip, e?.message);
            // One failure never stops the rest.
          }

          warmedThisRun.add(lower);
          localeCount++;
          trendingTotal++;

          // Politeness delay — skip after the very last trending chip overall.
          if (trendingTotal < TRENDING_MAX_TOTAL) {
            await new Promise((r) => setTimeout(r, CHIP_DELAY_MS));
          }
        }
      }
    } catch (e) {
      // Trending import itself failed or some unexpected error — static warm is
      // still fully valid; just log and move on.
      console.warn('[warm] trending pass error:', e?.message);
    }
  } catch (e) {
    // Outer catch: any unexpected error (e.g. agent import failure) must not
    // surface to callers — they fire-and-forget.
    console.warn('[warm] unexpected error:', e?.message);
  } finally {
    _running = false;
  }

  return { warmed, skipped, trendingWarmed, trendingSkipped };
}
