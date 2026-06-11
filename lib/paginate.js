// Pure pagination + honest-depth helpers. No server or client dependencies, so
// this is safe to import from BOTH the agent (server) and the results UI
// (client) without pulling server-only modules into the browser bundle.

// Cards per page in the results grid.
export const PAGE_SIZE = 9;

// Honest-depth cap: the most picks we'll surface for a single category. Reached
// only when relevance holds that deep (see shouldStopDeepening) — it's a ceiling,
// not a quota.
export const CATEGORY_CAP = 45;

// Split an array into fixed-size pages. Nullish input → no pages.
export function chunk(arr, size = PAGE_SIZE) {
  const out = [];
  if (!arr) return out;
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Honest depth: stop deepening a category when the target depth is reached, or
// when the latest discover page added too few NEW relevant titles (the relevant
// supply is drying up — padding past this point would surface off-target titles).
export function shouldStopDeepening({ total, added, target = CATEGORY_CAP, minNew = 3 }) {
  return total >= target || added < minNew;
}
