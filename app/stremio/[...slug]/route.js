/**
 * Stremio addon endpoints — exposes Natter's recommendations to Stremio-compatible
 * clients (Nuvio). A single catch-all handles the addon's flat URL scheme:
 *
 *   GET /stremio/manifest.json
 *   GET /stremio/catalog/{type}/{id}/search={query}.json   →  { metas: [...] }
 *
 * The user installs it in Nuvio by adding  https://<host>/stremio/manifest.json
 * under Settings → Addons. Typing (or keyboard dictation) in Nuvio's search runs
 * the query through Natter's recommendation engine; results carry IMDb ids so the
 * detail page and the user's installed stream sources resolve and play them.
 */

import {
  buildManifest,
  metaFromDetails,
  parseExtra,
  pickToMeta,
  toNatterKind,
  toStremioType,
} from '@/lib/stremio.js';

// Search hits an LLM loop — never prerender/cache the handler itself.
export const dynamic = 'force-dynamic';

const MAX_QUERY_CHARS = 500;

// Stremio addons are fetched cross-origin by clients; advertise permissive CORS.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function json(body, { status = 200, cache = 'no-store' } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      ...CORS,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Public origin, honouring the reverse proxy (Cloudflare) in front of Natter. */
function originOf(request) {
  const h = request.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

export async function GET(request, ctx) {
  const { slug = [] } = await ctx.params;
  const origin = originOf(request);

  // /stremio/manifest.json
  if (slug.length === 1 && slug[0] === 'manifest.json') {
    return json(buildManifest({ logo: origin ? `${origin}/icon.svg` : undefined }), {
      cache: 'public, max-age=3600',
    });
  }

  // /stremio/catalog/{type}/{id}[/{extra}].json
  if (slug[0] === 'catalog') {
    const type = slug[1];
    if (type !== 'movie' && type !== 'series') return json({ metas: [] });

    // When an extra is present it is the 4th segment ("search=…json"); the id
    // (3rd segment) then carries no ".json". Search-only catalog → no extra
    // means a browse request, which we don't serve.
    const { search } = parseExtra(slug.length >= 4 ? slug[3] : '');
    const query = (search || '').trim();
    if (!query || query.length > MAX_QUERY_CHARS) return json({ metas: [] });

    // Public, unauthenticated, and each call is a full recommendation loop — cap
    // per IP (a Nuvio search fans out to two requests: movie + series).
    const { rateLimited } = await import('@/lib/auth.js');
    const ip =
      request.headers.get('cf-connecting-ip') ||
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'local';
    if (rateLimited(`stremio:${ip}`, { max: 40, windowMs: 5 * 60_000 })) {
      return json({ metas: [] }, { status: 429 });
    }

    const { recommend } = await import('@/lib/agent.js');
    const { imdbId } = await import('@/lib/tmdb.js');

    let picks = [];
    try {
      const result = await recommend({
        query,
        kind: toNatterKind(type),
        services: [],
        excludeIds: new Set(),
        onStep() {},
        onCandidates() {},
        onPartial() {},
      });
      picks = (result?.picks || []).filter((p) => toStremioType(p.kind) === type);
    } catch (err) {
      console.error('[/stremio catalog]', err);
      return json({ metas: [] });
    }

    // Resolve IMDb ids in parallel; drop picks we can't map (not playable).
    const metas = (
      await Promise.all(
        picks.map(async (p) => {
          const imdb = await imdbId({
            tmdbId: p.tmdbId,
            kind: p.kind === 'tv' ? 'tv' : 'movie',
          });
          return pickToMeta(p, { imdb, origin });
        }),
      )
    ).filter(Boolean);

    return json({ metas }, { cache: 'public, max-age=600' });
  }

  // /stremio/meta/{type}/{id}.json — detail page + (for series) full episode
  // list, so playback works even with no separate metadata addon installed.
  if (slug[0] === 'meta') {
    const type = slug[1];
    if (type !== 'movie' && type !== 'series') return json({ meta: null }, { status: 404 });

    let id = slug[2] || '';
    if (id.endsWith('.json')) id = id.slice(0, -5);
    if (!/^tt\d+$/.test(id)) return json({ meta: null }, { status: 404 });

    const { findByImdb, getDetails, getSeriesEpisodes } = await import('@/lib/tmdb.js');
    const kind = type === 'series' ? 'tv' : 'movie';
    try {
      const tmdbId = await findByImdb({ imdb: id, type: kind });
      if (!tmdbId) return json({ meta: null }, { status: 404 });
      const [details, episodes] = await Promise.all([
        getDetails({ tmdbId, kind }),
        type === 'series' ? getSeriesEpisodes({ tmdbId }) : Promise.resolve([]),
      ]);
      const meta = metaFromDetails(details, { imdb: id, type, origin, episodes });
      if (!meta) return json({ meta: null }, { status: 404 });
      return json({ meta }, { cache: 'public, max-age=86400' });
    } catch (err) {
      console.error('[/stremio meta]', err);
      return json({ meta: null }, { status: 404 });
    }
  }

  return json({ error: 'not found' }, { status: 404 });
}
