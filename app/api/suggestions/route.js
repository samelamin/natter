import { dbAvailable } from '@/lib/db.js';
import { getTrendingChips } from '@/lib/trending.js';

// Per-instance in-memory cache keyed by resolved locale, TTL 10 min
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(request) {
  if (!dbAvailable()) {
    return Response.json({ chips: [] });
  }

  const country = request.headers.get('cf-ipcountry');

  // Normalise for cache key — match resolveLocale in lib/trending.js
  const locale = typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : 'GLOBAL';

  const cached = cacheGet(locale);
  if (cached) {
    return Response.json(cached, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const result = await getTrendingChips(country);
    cacheSet(locale, result);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ chips: [] });
  }
}
