/**
 * lib/stremio.js — Stremio addon protocol helpers.
 *
 * Natter is exposed to Stremio-compatible clients (e.g. Nuvio) as a *catalog*
 * addon: it answers a search query with recommendations. The pure, I/O-free
 * shaping logic lives here; the HTTP wiring + recommend()/TMDB calls live in
 * app/stremio/[...slug]/route.js.
 *
 * Protocol (the spec is vendored in Nuvio's repo and mirrors the official SDK):
 *   GET {base}/manifest.json
 *   GET {base}/catalog/{type}/{id}/search={query}.json  →  { metas: [...] }
 *
 * Results carry IMDb ids ("tt…") so the client can resolve the detail page and
 * stream sources exactly as it would for a Cinemeta result.
 */

const ADDON_ID = 'cc.natter.stremio';
const ADDON_VERSION = '1.0.0';
const CATALOG_ID = 'natter';

/** Stremio content type ('movie'|'series') from a Natter kind ('film'|'tv'). */
export function toStremioType(kind) {
  return kind === 'tv' ? 'series' : 'movie';
}

/** Natter kind ('film'|'tv') from a Stremio content type ('movie'|'series'). */
export function toNatterKind(type) {
  return type === 'series' ? 'tv' : 'film';
}

/**
 * Build the addon manifest. `logo` (if given) should be an absolute URL built
 * from the request origin. A search-only catalog (extra.search isRequired) is
 * declared for each type, so Natter appears when the user searches rather than
 * as a browsable Home/Discover rail.
 */
export function buildManifest({ logo } = {}) {
  const searchCatalog = (type) => ({
    type,
    id: CATALOG_ID,
    name: 'Natter',
    extra: [{ name: 'search', isRequired: true }],
  });
  return {
    id: ADDON_ID,
    version: ADDON_VERSION,
    name: 'Natter',
    description:
      "AI recommendations from Natter — search by describing what you're in the mood for.",
    ...(logo ? { logo } : {}),
    // `meta` makes the addon self-sufficient: it serves the detail page +
    // episode list itself, so playback works without a separate metadata addon.
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    // We emit IMDb ids; declaring the prefix lets clients route meta/stream
    // resolution for our results to the right addons.
    idPrefixes: ['tt'],
    catalogs: [searchCatalog('movie'), searchCatalog('series')],
    behaviorHints: { configurable: false, adult: false },
  };
}

/**
 * Parse a Stremio "extra" path segment into a plain object.
 * Looks like "search=the matrix" or "skip=20&genre=Action" (a trailing ".json"
 * is tolerated). Values are already URL-decoded by the router. Returns {} when
 * the segment is empty or absent.
 */
export function parseExtra(segment) {
  if (!segment) return {};
  const s = segment.endsWith('.json') ? segment.slice(0, -5) : segment;
  const out = {};
  for (const part of s.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    if (key) out[key] = part.slice(eq + 1);
  }
  return out;
}

/** Make a possibly-relative ('/img/…') URL absolute against an origin. */
export function absUrl(url, origin) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!origin) return undefined;
  return url.startsWith('/') ? origin + url : `${origin}/${url}`;
}

/**
 * Map a Natter pick → Stremio Meta Preview Object. Requires an IMDb id ("tt…");
 * clients key meta/stream resolution on it, so a pick without one isn't reliably
 * playable and the caller should drop it (this returns null).
 */
export function pickToMeta(pick, { imdb, origin } = {}) {
  if (!imdb || !pick) return null;
  const meta = {
    id: imdb,
    type: toStremioType(pick.kind),
    name: pick.title,
    posterShape: 'poster',
  };
  const poster = absUrl(pick.poster, origin);
  if (poster) meta.poster = poster;
  const background = absUrl(pick.backdropSrc, origin);
  if (background) meta.background = background;
  if (pick.blurb) meta.description = pick.blurb;
  if (pick.year) meta.releaseInfo = String(pick.year);
  if (pick.rating != null) meta.imdbRating = String(pick.rating);
  if (Array.isArray(pick.genres) && pick.genres.length) meta.genres = pick.genres;
  return meta;
}

/**
 * Map an enriched TMDB details object (lib/tmdb.js getDetails) → a full Stremio
 * Meta object for the addon's `meta` resource. For a series, pass `episodes`
 * (lib/tmdb.js getSeriesEpisodes) to build the `videos` array — each video's id
 * is "tt…:S:E", which is what stream addons (e.g. AIOStreams) resolve per
 * episode. Returns null without an IMDb id.
 */
export function metaFromDetails(details, { imdb, type, origin, episodes } = {}) {
  if (!imdb || !details) return null;
  const meta = { id: imdb, type, name: details.title, posterShape: 'poster' };
  const poster = absUrl(details.posterSrc, origin);
  if (poster) meta.poster = poster;
  const background = absUrl(details.backdropSrc, origin);
  if (background) meta.background = background;
  const description = details.synopsis || details.blurb;
  if (description) meta.description = description;
  if (details.year) meta.releaseInfo = String(details.year);
  if (details.rating != null) meta.imdbRating = String(details.rating);
  if (Array.isArray(details.genres) && details.genres.length) meta.genres = details.genres;
  if (details.runtime) meta.runtime = details.runtime;
  if (details.director) meta.director = [details.director];
  if (Array.isArray(details.cast) && details.cast.length) {
    meta.cast = details.cast.map((c) => c.name).filter(Boolean);
  }
  if (details.trailerKey) meta.trailers = [{ source: details.trailerKey, type: 'Trailer' }];
  if (type === 'series' && Array.isArray(episodes) && episodes.length) {
    meta.videos = episodes.map((e) => {
      const video = {
        id: `${imdb}:${e.season}:${e.episode}`,
        title: e.name || `Episode ${e.episode}`,
        season: e.season,
        episode: e.episode,
      };
      if (e.air_date) video.released = `${e.air_date}T00:00:00.000Z`;
      if (e.overview) video.overview = e.overview;
      const thumbnail = absUrl(e.still, origin);
      if (thumbnail) video.thumbnail = thumbnail;
      return video;
    });
  }
  return meta;
}
