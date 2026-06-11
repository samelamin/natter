/**
 * lib/tmdb.js — server-only TMDB enrichment module.
 * NEVER import from client code.
 *
 * Exports:
 *   getDetails({ tmdbId, kind, season? }) → enriched item
 *   searchByTitle({ title, year, kind })  → tmdbId (fallback when pick lacks one)
 */

import { createHash } from 'node:crypto';
import { cacheAvailable, cacheGetJSON, cacheSetJSON } from './cache.js';

const TMDB_KEY = process.env.TMDB_KEY;
const BASE = 'https://api.themoviedb.org/3';
// Images are served through our own origin (see app/img/[...path]/route.js) rather
// than hotlinked from image.tmdb.org, so visitors whose network/region/extension
// blocks TMDB's image CDN still get images (via Cloudflare on our domain).
const IMG_BASE = '/img';

// ── Image helper ────────────────────────────────────────────────────────────

/** Build an image URL routed through our proxy. Returns null if no path. */
export function img(path, size = 'w500') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

const TMDB_IMG_ORIGIN = 'https://image.tmdb.org/t/p';

/**
 * Inverse of img(): convert a proxied path ('/img/w1280/x.jpg') back to the
 * absolute TMDB CDN url. For server-side fetches (e.g. next/og) that can't use
 * the same-origin /img proxy. Returns null for falsy input.
 */
export function tmdbImageUrl(proxied) {
  if (!proxied) return null;
  const s = String(proxied);
  const rel = s.startsWith(IMG_BASE) ? s.slice(IMG_BASE.length) : s;
  return `${TMDB_IMG_ORIGIN}${rel}`;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

/** "1h 58m" / "52m" from a minute count. Returns null if falsy. */
export function runtime(mins) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Pick the best YouTube trailer key from a TMDB videos.results array. */
export function trailerKey(videos) {
  const yt = (videos || []).filter((v) => v.site === 'YouTube');
  const pick =
    yt.find((v) => v.type === 'Trailer' && v.official) ||
    yt.find((v) => v.type === 'Trailer') ||
    yt.find((v) => v.type === 'Teaser') ||
    yt[0];
  return pick ? pick.key : null;
}

/** UK-style certificate from release_dates (movie). */
export function movieCert(releaseDates, region = 'GB') {
  const r = (releaseDates?.results || []).find((x) => x.iso_3166_1 === region);
  const c = r && (r.release_dates || []).map((d) => d.certification).find(Boolean);
  return c || null;
}

/** Certificate from content_ratings (tv). */
export function tvCert(contentRatings, region = 'GB') {
  const r = (contentRatings?.results || []).find((x) => x.iso_3166_1 === region);
  return (r && r.rating) || null;
}

/**
 * Map watch/providers for a region into { stream, rent, buy, link }.
 * Each entry is { name, logo } (logo is a w92 image URL or null).
 */
function mapWatch(watchProviders, region = 'GB') {
  const wp = watchProviders?.results?.[region] || {};
  const toProv = (p) => ({
    name: p.provider_name,
    logo: img(p.logo_path, 'w92'),
  });
  return {
    stream: (wp.flatrate || []).map(toProv),
    rent: (wp.rent || []).map(toProv),
    buy: (wp.buy || []).map(toProv),
    link: wp.link || null,
  };
}

/** First streaming provider { name, logoSrc } for quick card display. */
function primaryProvider(watchProviders, region = 'GB') {
  const wp = watchProviders?.results?.[region] || {};
  const p = (wp.flatrate || wp.free || wp.ads || [])[0];
  return p ? { name: p.provider_name, logoSrc: img(p.logo_path, 'w92') } : null;
}

/** Top 10 cast members. */
function mapCast(credits) {
  return (credits?.cast || []).slice(0, 10).map((c) => ({
    name: c.name,
    character: c.character,
    profileSrc: img(c.profile_path, 'w185'),
  }));
}

/** Up to 4 backdrop stills. */
function mapStills(images, max = 4) {
  return (images?.backdrops || []).slice(0, max).map((b) => img(b.file_path, 'w780'));
}

// ── Adapters ────────────────────────────────────────────────────────────────

/**
 * Map a TMDB movie details object → kit item.
 * @param {object} m   Full TMDB movie details (with appended responses)
 * @param {object} opts { match, region }
 */
export function fromMovie(m, { match, region = 'GB' } = {}) {
  const prov = primaryProvider(m['watch/providers'], region);
  return {
    title: m.title,
    kind: 'film',
    year: m.release_date ? +m.release_date.slice(0, 4) : undefined,
    runtime: runtime(m.runtime),
    cert: movieCert(m.release_dates, region),
    rating: m.vote_average ? +m.vote_average.toFixed(1) : undefined,
    match,
    on: prov?.name || null,
    onLogo: prov?.logoSrc || null,
    genres: (m.genres || []).map((g) => g.name),
    director: (m.credits?.crew || []).find((c) => c.job === 'Director')?.name || null,
    cast: mapCast(m.credits),
    tagline: m.tagline || null,
    blurb: m.overview || null,
    synopsis: m.overview || null,
    posterSrc: img(m.poster_path, 'w500'),
    backdropSrc: img(m.backdrop_path, 'w1280'),
    stills: mapStills(m.images),
    trailerKey: trailerKey(m.videos?.results),
    watch: mapWatch(m['watch/providers'], region),
    // Internal — used by the enrichment layer; not consumed by UI
    tmdbId: m.id,
  };
}

/**
 * Map a TMDB TV details object → kit item.
 * @param {object} t      Full TMDB TV details (with appended responses)
 * @param {object} opts   { match, region, season } — season is a /season/{n} response
 */
export function fromTv(t, { match, region = 'GB', season } = {}) {
  const epRun = (t.episode_run_time || [])[0];
  const prov = primaryProvider(t['watch/providers'], region);
  const item = {
    title: t.name,
    kind: 'tv',
    year: t.first_air_date ? +t.first_air_date.slice(0, 4) : undefined,
    runtime: `${t.number_of_episodes || ''} eps${epRun ? ` · ${epRun}m` : ''}`.trim(),
    cert: tvCert(t.content_ratings, region),
    rating: t.vote_average ? +t.vote_average.toFixed(1) : undefined,
    match,
    on: prov?.name || null,
    onLogo: prov?.logoSrc || null,
    genres: (t.genres || []).map((g) => g.name),
    director: (t.created_by || [])[0]?.name || null,
    cast: mapCast(t.credits),
    tagline: t.tagline || null,
    blurb: t.overview || null,
    synopsis: t.overview || null,
    posterSrc: img(t.poster_path, 'w500'),
    backdropSrc: img(t.backdrop_path, 'w1280'),
    stills: mapStills(t.images),
    trailerKey: trailerKey(t.videos?.results),
    watch: mapWatch(t['watch/providers'], region),
    tmdbId: t.id,
  };
  if (season?.episodes) {
    item.episodes = season.episodes.slice(0, 8).map((e) => ({
      n: e.episode_number,
      title: e.name,
      dur: epRun ? `${epRun}m` : '',
      desc: e.overview,
      stillSrc: img(e.still_path, 'w300'),
    }));
  }
  return item;
}

// ── In-memory cache ────────────────────────────────────────────────────────

const _cache = new Map(); // key → { data, expiresAt }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (TMDB details rarely change)

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Fetch with retry + timeout ─────────────────────────────────────────────

const RETRY_DELAYS_MS = [600, 1500, 3000];

async function fetchJson(url, timeout = 8000) {
  const cached = cacheGet(url);
  if (cached !== null) return cached;

  // L2: check Redis before hitting the upstream API.
  // The URL contains the TMDB api key — hash it so the key never appears in Redis.
  if (cacheAvailable()) {
    const rkey = 'natter:tmdb:v1:' + createHash('sha256').update(url).digest('hex');
    const l2hit = await cacheGetJSON(rkey, { timeoutMs: 150 });
    if (l2hit !== null) {
      cacheSet(url, l2hit);
      return l2hit;
    }
  }

  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}: ${url}`);
        if (attempt < RETRY_DELAYS_MS.length) {
          const jitter = Math.floor(Math.random() * 200);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] + jitter));
          continue;
        }
        break;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

      const data = await res.json();
      cacheSet(url, data);
      // L2: persist to Redis (1h, matching CACHE_TTL_MS). Fire-and-forget.
      if (cacheAvailable()) {
        const rkey = 'natter:tmdb:v1:' + createHash('sha256').update(url).digest('hex');
        cacheSetJSON(rkey, data, 3600);
      }
      return data;
    } catch (err) {
      clearTimeout(id);
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length && err.name !== 'AbortError') {
        const jitter = Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] + jitter));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error(`fetchJson failed: ${url}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate an ISO 639-1 language code (optionally with region, e.g. "pt-BR").
 * Returns the code or undefined — callers interpolate it into TMDB URLs, so
 * anything malformed (or model-hallucinated) is dropped rather than passed on.
 */
function langParam(code) {
  return typeof code === 'string' && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(code) ? code : undefined;
}

/**
 * Fetch full TMDB details and return an enriched kit item.
 * @param {object} opts
 * @param {number|string} opts.tmdbId
 * @param {'movie'|'tv'} opts.kind
 * @param {number} [opts.season]   TV season number; if provided, episodes are included
 * @param {number} [opts.match]    Relevance % (0–100) from the recommendation engine
 * @param {string} [opts.region]   ISO 3166-1 region code (default 'GB')
 * @param {string} [opts.language] ISO 639-1 code — localizes title/overview; images
 *                                 and videos fall back to English when missing.
 */
export async function getDetails({ tmdbId, kind, season, match, region = 'GB', language }) {
  // These values are interpolated into upstream TMDB URLs below. Validate them here
  // so a non-numeric id/season or an unexpected kind can't path-inject and pivot the
  // server's TMDB_KEY to other endpoints (e.g. "693134/../../authentication/token/new").
  if (!/^\d+$/.test(String(tmdbId))) throw new Error(`getDetails: invalid tmdbId ${JSON.stringify(tmdbId)}`);
  if (kind !== 'movie' && kind !== 'tv') throw new Error(`getDetails: invalid kind ${JSON.stringify(kind)}`);
  if (season != null && !/^\d+$/.test(String(season))) throw new Error(`getDetails: invalid season ${JSON.stringify(season)}`);
  const type = kind === 'tv' ? 'tv' : 'movie';
  const appendMovie = 'videos,credits,images,release_dates,watch%2Fproviders';
  const appendTv = 'videos,credits,images,content_ratings,watch%2Fproviders';
  const append = type === 'tv' ? appendTv : appendMovie;
  const lang = langParam(language);
  const langQs = lang
    ? `&language=${lang}&include_image_language=${lang},null,en&include_video_language=${lang},en,null`
    : '';

  const detailUrl = `${BASE}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=${append}${langQs}`;
  const details = await fetchJson(detailUrl);

  let seasonData = null;
  if (type === 'tv' && season != null) {
    const seasonUrl = `${BASE}/tv/${tmdbId}/season/${season}?api_key=${TMDB_KEY}`;
    try {
      seasonData = await fetchJson(seasonUrl);
    } catch {
      // Season fetch is best-effort; proceed without episodes
    }
  }

  return type === 'tv'
    ? fromTv(details, { match, region, season: seasonData })
    : fromMovie(details, { match, region });
}

/**
 * Search TMDB by title (and optional year/kind) to get a tmdbId.
 * Used as a fallback when a pick from AIOMetadata lacks a tmdbId.
 * Returns null if nothing found.
 */
export async function searchByTitle({ title, year, kind }) {
  const type = kind === 'tv' ? 'tv' : 'movie';
  const q = encodeURIComponent(title);
  const yearParam = year ? `&year=${year}` : '';
  const url = `${BASE}/search/${type}?api_key=${TMDB_KEY}&query=${q}${yearParam}&page=1`;

  try {
    const data = await fetchJson(url);
    const results = data.results || [];
    if (results.length === 0) return null;
    return results[0].id;
  } catch {
    return null;
  }
}

// ── Genre maps ────────────────────────────────────────────────────────────────

/** Movie genre name → TMDB id */
export const MOVIE_GENRE_IDS = {
  Action: 28,
  Comedy: 35,
  Drama: 18,
  Thriller: 53,
  Horror: 27,
  'Sci-Fi': 878,
  'Science Fiction': 878,
  Crime: 80,
  Romance: 10749,
  Animation: 16,
  Documentary: 99,
  Family: 10751,
  Adventure: 12,
  Fantasy: 14,
  Mystery: 9648,
  War: 10752,
  Western: 37,
};

/** TV genre name → TMDB id */
export const TV_GENRE_IDS = {
  Comedy: 35,
  Drama: 18,
  Crime: 80,
  'Sci-Fi & Fantasy': 10765,
  'Science Fiction': 10765,
  'Sci-Fi': 10765,
  Animation: 16,
  Documentary: 99,
  Family: 10751,
  Mystery: 9648,
  Reality: 10764,
  'War & Politics': 10768,
  War: 10768,
  Western: 37,
  'Action & Adventure': 10759,
  Action: 10759,
};

/** TMDB genre id → name (merged from movie + tv) */
const GENRE_ID_TO_NAME = (() => {
  const map = {};
  for (const [name, id] of Object.entries(MOVIE_GENRE_IDS)) {
    if (!map[id]) map[id] = name;
  }
  for (const [name, id] of Object.entries(TV_GENRE_IDS)) {
    if (!map[id]) map[id] = name;
  }
  return map;
})();

function genreNames(genreIds) {
  return (genreIds || []).map((id) => GENRE_ID_TO_NAME[id] || String(id));
}

/**
 * Genre name → id, tolerant of the casing the agent's LLM sends ("sci-fi",
 * "COMEDY"). An unknown name returns undefined (discover runs unfiltered).
 */
function genreIdFor(map, name) {
  if (map[name] != null) return map[name];
  const want = String(name).trim().toLowerCase();
  for (const [k, id] of Object.entries(map)) {
    if (k.toLowerCase() === want) return id;
  }
  return undefined;
}

// ── Discovery helpers — shared pick shape ─────────────────────────────────────

/**
 * Map a TMDB /search/movie result item → agent pick shape.
 * Shape: { id, tmdbId, title, year, rating, genres, kind, poster, blurb, _vote_count }
 */
function movieResultToPick(m) {
  return {
    id: `tmdb:${m.id}`,
    tmdbId: m.id,
    title: m.title,
    kind: 'film',
    year: m.release_date ? +m.release_date.slice(0, 4) : undefined,
    rating: m.vote_average ? +m.vote_average.toFixed(1) : undefined,
    genres: genreNames(m.genre_ids),
    poster: img(m.poster_path),
    backdropSrc: img(m.backdrop_path, 'w1280'),
    blurb: m.overview || null,
    _vote_count: m.vote_count || 0,
  };
}

/**
 * Map a TMDB /search/tv or /discover/tv result item → agent pick shape.
 */
function tvResultToPick(t) {
  return {
    id: `tmdb:${t.id}`,
    tmdbId: t.id,
    title: t.name,
    kind: 'tv',
    year: t.first_air_date ? +t.first_air_date.slice(0, 4) : undefined,
    rating: t.vote_average ? +t.vote_average.toFixed(1) : undefined,
    genres: genreNames(t.genre_ids),
    poster: img(t.poster_path),
    backdropSrc: img(t.backdrop_path, 'w1280'),
    blurb: t.overview || null,
    _vote_count: t.vote_count || 0,
  };
}

// ── tmdbSearch ─────────────────────────────────────────────────────────────────

/**
 * Search TMDB by title.
 * @param {{ title: string, kind?: 'film'|'tv', language?: string, limit?: number }}
 * @returns {Promise<Pick[]>}
 */
export async function tmdbSearch({ title, kind = 'film', language, limit = 8 }) {
  const type = kind === 'tv' ? 'tv' : 'movie';
  const q = encodeURIComponent(title);
  const lang = langParam(language);
  const url = `${BASE}/search/${type}?api_key=${TMDB_KEY}&query=${q}&page=1${lang ? `&language=${lang}` : ''}`;
  try {
    const data = await fetchJson(url);
    const results = (data.results || []).slice(0, limit);
    return type === 'tv' ? results.map(tvResultToPick) : results.map(movieResultToPick);
  } catch {
    return [];
  }
}

// ── tmdbDiscover ───────────────────────────────────────────────────────────────

/**
 * Discover content via TMDB /discover endpoint.
 * @param {{ kind: 'film'|'tv', genre?: string, yearMin?: number, yearMax?: number,
 *           sort?: string, originCountry?: string, limit?: number }}
 * @returns {Promise<Pick[]>}
 */
export async function tmdbDiscover({
  kind = 'film',
  genre,
  yearMin,
  yearMax,
  sort = 'popularity.desc',
  originCountry,
  withoutGenres,
  originalLanguage,
  language,
  providers,
  limit = 20,
  page = 1,
}) {
  const type = kind === 'tv' ? 'tv' : 'movie';
  const genreMap = type === 'tv' ? TV_GENRE_IDS : MOVIE_GENRE_IDS;
  const genreId = genre ? genreIdFor(genreMap, genre) : undefined;
  const origLang = langParam(originalLanguage);
  const metaLang = langParam(language);

  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    sort_by: sort,
    // Non-English originals rarely reach 80 TMDB votes — a floor that high
    // would empty the pool for e.g. Arabic queries. Popularity sort still
    // puts the best-known titles first.
    'vote_count.gte': origLang && origLang !== 'en' ? '10' : '80',
    page: String(page),
  });

  if (genreId) params.set('with_genres', String(genreId));
  if (withoutGenres && withoutGenres.length) params.set('without_genres', withoutGenres.join(','));
  // Locale: filter to originally-<lang> content and localize title/overview.
  if (origLang) params.set('with_original_language', origLang);
  if (metaLang) params.set('language', metaLang);

  if (type === 'movie') {
    if (yearMin) params.set('primary_release_date.gte', `${yearMin}-01-01`);
    if (yearMax) params.set('primary_release_date.lte', `${yearMax}-12-31`);
  } else {
    if (yearMin) params.set('first_air_date.gte', `${yearMin}-01-01`);
    if (yearMax) params.set('first_air_date.lte', `${yearMax}-12-31`);
  }

  if (originCountry) params.set('with_origin_country', originCountry);

  // Streaming-service filter: only titles watchable on these TMDB provider ids
  // (subscription, free, or ad-supported — not rent/buy) in the GB region.
  if (providers && providers.length) {
    params.set('with_watch_providers', providers.join('|'));
    params.set('watch_region', 'GB');
    params.set('with_watch_monetization_types', 'flatrate|free|ads');
  }

  const url = `${BASE}/discover/${type}?${params.toString()}`;
  try {
    const data = await fetchJson(url);
    const results = (data.results || []).slice(0, limit);
    return type === 'tv' ? results.map(tvResultToPick) : results.map(movieResultToPick);
  } catch {
    return [];
  }
}

// ── tmdbWatchProviders ─────────────────────────────────────────────────────────

/**
 * GB watch options for one title: [{ id, name, logo }] across subscription,
 * free, and ad-supported tiers (rent/buy excluded — "can I watch it now").
 * Cached like every other TMDB call; [] on any error.
 */
export async function tmdbWatchProviders({ tmdbId, kind }) {
  const type = kind === 'tv' ? 'tv' : 'movie';
  const url = `${BASE}/${type}/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`;
  try {
    const data = await fetchJson(url);
    const gb = data?.results?.GB || {};
    const entries = [...(gb.flatrate || []), ...(gb.free || []), ...(gb.ads || [])];
    return entries.map((e) => ({
      id: e.provider_id,
      name: e.provider_name,
      logo: img(e.logo_path, 'w92'),
    }));
  } catch {
    return [];
  }
}

// ── tmdbPersonCredits ──────────────────────────────────────────────────────────

/**
 * Fetch a person's film/TV credits by name.
 * @param {{ name: string, kind?: 'film'|'tv'|'all', language?: string, limit?: number }}
 * @returns {Promise<Pick[]>}
 */
export async function tmdbPersonCredits({ name, kind = 'all', language, limit = 20 }) {
  const searchUrl = `${BASE}/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&page=1`;
  try {
    const searchData = await fetchJson(searchUrl);
    const person = (searchData.results || [])[0];
    if (!person) return [];

    const lang = langParam(language);
    const creditsUrl = `${BASE}/person/${person.id}/combined_credits?api_key=${TMDB_KEY}${lang ? `&language=${lang}` : ''}`;
    const creditsData = await fetchJson(creditsUrl);

    const cast = creditsData.cast || [];
    // Sort by popularity desc, then take the limit
    const sorted = cast.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    const picks = [];
    for (const item of sorted) {
      if (picks.length >= limit) break;
      if (item.media_type === 'movie' && kind !== 'tv') {
        picks.push(movieResultToPick({ ...item, genre_ids: item.genre_ids || [] }));
      } else if (item.media_type === 'tv' && kind !== 'film') {
        picks.push(tvResultToPick({ ...item, genre_ids: item.genre_ids || [] }));
      }
    }
    return picks;
  } catch {
    return [];
  }
}

// ── Test helpers (exported for unit tests only) ────────────────────────────

export function _testCacheClear() {
  _cache.clear();
}
