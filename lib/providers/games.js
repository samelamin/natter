/**
 * lib/providers/games.js — RAWG provider.
 * Returns unified "pick" objects shaped like every other provider.
 *
 *  GET https://api.rawg.io/api/games?key=…&search=…&page_size=…
 *  GET https://api.rawg.io/api/games/{id}?key=…
 *
 * Requires RAWG_API_KEY. search/getDetails throw a tagged { code: 'NO_KEY' }
 * error when the key is missing — the caller can fall back to a different
 * source for that query.
 */

import { cacheGetJSON, cacheSetJSON } from '../cache.js';

const BASE = 'https://api.rawg.io/api/games';
const TIMEOUT_MS = 12_000;
const CACHE_TTL = 21_600; // 6h — protects RAWG's 20k/mo free quota

// ── Helpers ────────────────────────────────────────────────────────────────

function round1(n) {
  return Math.round(n * 10) / 10;
}

function requireKey() {
  const k = process.env.RAWG_API_KEY;
  if (!k) {
    throw Object.assign(new Error('RAWG_API_KEY missing'), { code: 'NO_KEY' });
  }
  return k;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`games ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// ── normalizeToPick ────────────────────────────────────────────────────────

/**
 * Map a RAWG game object into the unified pick shape.
 * Accepts either a list result or a full detail (the only extra field
 * getDetails folds in is `description_raw`).
 *
 * @param {object} g  RAWG game object
 */
export function normalizeToPick(g) {
  const genres = Array.isArray(g.genres) ? g.genres.map((x) => x.name) : [];
  const platforms = Array.isArray(g.platforms)
    ? g.platforms.map((p) => p.platform?.name).filter(Boolean)
    : [];
  const screenshots = Array.isArray(g.short_screenshots)
    ? g.short_screenshots.map((s) => s.image)
    : [];

  // Prefer metacritic when present — it's critic consensus, more reliable than
  // RAWG's user rating. Fall back to RAWG rating × 2 (5-pt → 10-pt scale).
  let rating = null;
  if (typeof g.metacritic === 'number' && g.metacritic > 0) {
    rating = round1(g.metacritic / 10);
  } else if (typeof g.rating === 'number' && g.rating > 0) {
    rating = round1(g.rating * 2);
  }

  const year = g.released ? parseInt(String(g.released).slice(0, 4), 10) : null;

  return {
    id: `game:${g.id}`,
    domain: 'game',
    sourceId: String(g.id),
    title: g.name || '',
    subtitle: genres.slice(0, 2).join(', '),
    year: Number.isFinite(year) ? year : null,
    rating,
    image: g.background_image || null,
    reason: '',
    match: null,
    meta: {
      platforms,
      genres,
      metacritic: typeof g.metacritic === 'number' ? g.metacritic : null,
      released: g.released || '',
      description: g.description_raw || '',
      screenshots,
    },
  };
}

// ── search / getDetails ─────────────────────────────────────────────────────

/**
 * Search RAWG.
 * @param {{
 *   query: string,
 *   limit?: number,
 *   filters?: { genres?: string, ordering?: string, dates?: string },
 * }}
 * @returns {Promise<object[]>}  unified picks
 */
export async function search({ query, limit = 20, filters = {} } = {}) {
  const key = requireKey();
  const params = new URLSearchParams({
    key,
    search: query || '',
    page_size: String(limit),
    search_precise: 'true',
    ordering: filters.ordering || '-rating',
  });
  if (filters.genres) params.set('genres', filters.genres);
  if (filters.dates) params.set('dates', filters.dates);

  const ck = `prov:game:search:${(query || '').toLowerCase()}|${limit}|${filters.genres || ''}|${filters.ordering || ''}|${filters.dates || ''}`;
  const cached = await cacheGetJSON(ck);
  if (cached) return cached;
  const url = `${BASE}?${params.toString()}`;
  const data = await fetchJson(url);
  const picks = (data.results || []).map(normalizeToPick);
  cacheSetJSON(ck, picks, CACHE_TTL);
  return picks;
}

/**
 * Fetch a single RAWG game by id (includes description_raw).
 * @param {string} sourceId
 * @returns {Promise<object>}  unified pick
 */
export async function getDetails(sourceId) {
  const key = requireKey();
  const ck = `prov:game:details:${sourceId}`;
  const cached = await cacheGetJSON(ck);
  if (cached) return cached;
  const url = `${BASE}/${encodeURIComponent(sourceId)}?key=${key}`;
  const data = await fetchJson(url);
  const pick = normalizeToPick(data);
  cacheSetJSON(ck, pick, CACHE_TTL);
  return pick;
}

// ── Provider metadata ──────────────────────────────────────────────────────

export const domain = 'game';
export const label = 'Games';
export const accent = '#5BC8AF';