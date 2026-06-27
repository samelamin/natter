/**
 * lib/providers/games.js — IGDB provider (Twitch OAuth + Apicalypse).
 *
 *   POST https://id.twitch.tv/oauth2/token   (client_credentials → bearer)
 *   POST https://api.igdb.com/v4/games        (Apicalypse query in the body)
 *
 * Requires IGDB_CLIENT_ID + IGDB_CLIENT_SECRET. search/getDetails throw a tagged
 * { code: 'NO_KEY' } error when missing — the caller falls back to LLM-sourced
 * game titles. Cover art / critic scores come from IGDB.
 */

import { cacheGetJSON, cacheSetJSON } from '../cache.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API = 'https://api.igdb.com/v4/games';
const TIMEOUT_MS = 12_000;
const CACHE_TTL = 21_600; // 6h
const FIELDS =
  'name,first_release_date,rating,aggregated_rating,cover.image_id,genres.name,' +
  'platforms.name,summary,involved_companies.company.name,involved_companies.developer,' +
  'screenshots.image_id';

// User-facing platform keys → IGDB platform IDs (a key can map to several).
export const PLATFORM_IDS = {
  pc: [6],
  playstation: [167, 48, 9], // PS5, PS4, PS3
  xbox: [169, 49, 12], // Series X|S, One, 360
  switch: [130, 508], // Switch, Switch 2
  mobile: [39, 34], // iOS, Android
};

/** Map user platform keys → a flat list of IGDB platform IDs. */
export function platformIdsFor(keys) {
  const out = [];
  for (const k of keys || []) {
    for (const id of PLATFORM_IDS[k] || []) out.push(id);
  }
  return [...new Set(out)];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** IGDB image CDN URL for an image_id at a given size preset. */
function imgUrl(imageId, size) {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : null;
}

function requireCreds() {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET missing'), { code: 'NO_KEY' });
  }
  return { clientId, clientSecret };
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── OAuth token (in-process + Redis cache) ──────────────────────────────────

let _token = null; // { value, expiresAt }

async function getToken(force = false) {
  const { clientId, clientSecret } = requireCreds();
  const fresh = (t) => t && t.value && t.expiresAt > Date.now() + 60_000;
  if (!force && fresh(_token)) return _token.value;
  if (!force) {
    const cached = await cacheGetJSON('igdb:token');
    if (fresh(cached)) {
      _token = cached;
      return cached.value;
    }
  }
  const url = `${TOKEN_URL}?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
  const res = await fetchWithTimeout(url, { method: 'POST' });
  if (!res.ok) throw new Error(`igdb token ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('igdb token: no access_token');
  _token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  cacheSetJSON('igdb:token', _token, Math.max(60, (Number(data.expires_in) || 3600) - 300));
  return _token.value;
}

/** POST an Apicalypse query, refreshing the token once on a 401. */
async function igdbQuery(body) {
  const { clientId } = requireCreds();
  const run = async (token) =>
    fetchWithTimeout(API, {
      method: 'POST',
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body,
    });
  let res = await run(await getToken());
  if (res.status === 401) {
    _token = null;
    res = await run(await getToken(true));
  }
  if (!res.ok) throw new Error(`igdb ${res.status}`);
  return res.json();
}

// ── normalizeToPick ──────────────────────────────────────────────────────────

/**
 * Map an IGDB game into the unified pick shape.
 * @param {object} g  IGDB game resource
 */
export function normalizeToPick(g) {
  const genres = Array.isArray(g.genres) ? g.genres.map((x) => x.name).filter(Boolean) : [];
  const platforms = Array.isArray(g.platforms) ? g.platforms.map((p) => p.name).filter(Boolean) : [];
  const companies = Array.isArray(g.involved_companies) ? g.involved_companies : [];
  const dev = companies.find((c) => c.developer)?.company?.name || companies[0]?.company?.name || '';
  const year = g.first_release_date
    ? new Date(g.first_release_date * 1000).getUTCFullYear()
    : null;
  // Prefer the aggregated critic score; fall back to the user rating (both 0-100).
  const score = typeof g.aggregated_rating === 'number'
    ? g.aggregated_rating
    : (typeof g.rating === 'number' ? g.rating : null);
  return {
    id: `game:${g.id}`,
    domain: 'game',
    sourceId: String(g.id),
    title: g.name || '',
    subtitle: dev || genres.slice(0, 2).join(', '),
    year: Number.isFinite(year) ? year : null,
    rating: score != null ? round1(score / 10) : null,
    image: imgUrl(g.cover?.image_id, 'cover_big'),
    reason: '',
    match: null,
    meta: {
      platforms,
      genres,
      metacritic: typeof g.aggregated_rating === 'number' ? Math.round(g.aggregated_rating) : null,
      released: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : '',
      description: g.summary || '',
      screenshots: Array.isArray(g.screenshots)
        ? g.screenshots.map((s) => imgUrl(s.image_id, 'screenshot_big')).filter(Boolean)
        : [],
    },
  };
}

// ── search / getDetails ─────────────────────────────────────────────────────

/**
 * Search IGDB.
 * @param {{ query: string, limit?: number, filters?: object }}
 * @returns {Promise<object[]>}  unified picks
 */
export async function search({ query, limit = 20, filters = {} } = {}) {
  requireCreds(); // throw NO_KEY early so the caller can fall back
  const safe = String(query || '').replace(/["\n;]/g, ' ').trim().slice(0, 100);
  const platIds = Array.isArray(filters.platforms)
    ? filters.platforms.filter((n) => Number.isInteger(n))
    : [];
  const ck = `prov:game:search:${safe.toLowerCase()}|${limit}|${platIds.join(',')}`;
  const cached = await cacheGetJSON(ck);
  if (cached) return cached;
  // `search` ranks by relevance; version_parent=null drops port/version dupes
  // (edition/DLC title-dupes are collapsed downstream). Optionally constrain to
  // the user's platforms.
  const where = [`version_parent = null`];
  // IGDB `platforms = (a,b)` means "has ALL of a,b" — we want "has ANY", so OR.
  if (platIds.length) where.push(`(${platIds.map((id) => `platforms = ${id}`).join(' | ')})`);
  const body = `search "${safe}"; fields ${FIELDS}; where ${where.join(' & ')}; limit ${limit};`;
  const data = await igdbQuery(body);
  const picks = (Array.isArray(data) ? data : []).map(normalizeToPick);
  if (picks.length) cacheSetJSON(ck, picks, CACHE_TTL);
  return picks;
}

/**
 * Fetch a single IGDB game by id.
 * @param {string} sourceId
 * @returns {Promise<object|null>}  unified pick or null
 */
export async function getDetails(sourceId) {
  requireCreds();
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return null;
  const ck = `prov:game:details:${id}`;
  const cached = await cacheGetJSON(ck);
  if (cached) return cached;
  const body = `fields ${FIELDS}; where id = ${id};`;
  const data = await igdbQuery(body);
  const g = (Array.isArray(data) ? data : [])[0];
  const pick = g ? normalizeToPick(g) : null;
  if (pick) cacheSetJSON(ck, pick, CACHE_TTL);
  return pick;
}

// ── Provider metadata ──────────────────────────────────────────────────────

export const domain = 'game';
export const label = 'Games';
export const accent = '#5BC8AF';
