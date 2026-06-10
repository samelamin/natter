/**
 * lib/brave.js — server-only Brave Search client.
 * NEVER import from client-side code.
 */

// ── In-memory URL cache (10 min TTL) ─────────────────────────────────────────

const _braveCache = new Map(); // url → { data, expiresAt }
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheGet(url) {
  const entry = _braveCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _braveCache.delete(url);
    return null;
  }
  return entry.data;
}

function cacheSet(url, data) {
  _braveCache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Exported cache helpers (for testing) ─────────────────────────────────────

export function _testCacheSet(url, data) {
  cacheSet(url, data);
}

export function _testCacheClear() {
  _braveCache.clear();
}

/**
 * braveSearch(query, count) → [{title, url, description}]
 * Returns [] on any error (tolerate; the agent can still use AIOMetadata).
 * Retries once on 429/5xx (Brave free tier ≈ 1 rps).
 */
export async function braveSearch(query, count = 8) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    console.warn('[brave] BRAVE_SEARCH_API_KEY not set');
    return [];
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

  // Serve from cache if available
  const cached = cacheGet(url);
  if (cached !== null) return cached;

  const MAX_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      let res;
      try {
        res = await fetch(url, {
          headers: {
            'X-Subscription-Token': key,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(id);
      }

      if (res.status === 429 || res.status >= 500) {
        console.warn(`[brave] HTTP ${res.status} for query: ${query} (attempt ${attempt + 1})`);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 400)));
          continue;
        }
        return [];
      }

      if (!res.ok) {
        console.warn(`[brave] HTTP ${res.status} for query: ${query}`);
        return [];
      }

      const data = await res.json();
      const results = (data.web?.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        description: (r.description || '').slice(0, 200),
      }));
      cacheSet(url, results);
      return results;
    } catch (err) {
      console.warn(`[brave] error (attempt ${attempt + 1}):`, err.message);
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return [];
    }
  }
  return [];
}
