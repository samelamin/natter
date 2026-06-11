/**
 * lib/hydrateQueue.js — PURE, zero imports.
 *
 * Utilities for hydrating watchlist items with watch-provider data.
 */

/**
 * pickHydrationTargets(items, cachedKeys, max = 12)
 *
 * Returns the first `max` items (in given order) that:
 *   - have a valid integer tmdbId (Number.isInteger check)
 *   - do NOT already have a .watch property (undefined means not yet fetched)
 *   - whose `${kind}:${tmdbId}` key is NOT in cachedKeys (a Set)
 *
 * Does not mutate the input array or any item objects.
 *
 * @param {Array}  items      - watchlist items
 * @param {Set}    cachedKeys - Set of `${kind}:${tmdbId}` strings already fetched
 * @param {number} max        - maximum number of targets to return (default 12)
 * @returns {Array} subset of items eligible for hydration
 */
export function pickHydrationTargets(items, cachedKeys, max = 12) {
  const targets = [];
  for (const item of items) {
    if (targets.length >= max) break;
    // Must have a valid integer tmdbId
    if (!Number.isInteger(item.tmdbId)) continue;
    // Must not already have a .watch property (null means fetched+nothing; undefined means not fetched)
    if (item.watch !== undefined) continue;
    // Must not be in the module-level cache
    const key = `${item.kind}:${item.tmdbId}`;
    if (cachedKeys.has(key)) continue;
    targets.push(item);
  }
  return targets;
}

/**
 * createLimiter(concurrency)
 *
 * Returns an async function `run(tasks)` where:
 *   - tasks is an array of async thunks (() => Promise)
 *   - at most `concurrency` tasks are in flight at once
 *   - resolves to a results array aligned with input order
 *   - a rejected thunk yields null in its slot (never throws)
 *   - handles empty array
 *
 * @param {number} concurrency - max number of tasks in flight simultaneously
 * @returns {function(Array<function>): Promise<Array>}
 */
export function createLimiter(concurrency) {
  return async function run(tasks) {
    if (!tasks.length) return [];

    const results = new Array(tasks.length).fill(null);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < tasks.length) {
        const i = nextIndex++;
        try {
          results[i] = await tasks[i]();
        } catch {
          results[i] = null;
        }
      }
    }

    const workerCount = Math.min(concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  };
}
