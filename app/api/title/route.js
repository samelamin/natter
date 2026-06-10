/**
 * POST /api/title
 * Body: { tmdbId, kind: 'movie'|'tv', season?: number }
 * Returns: enriched item JSON (cast, trailer, stills, watch, episodes, etc.)
 *
 * Server-side only — TMDB_KEY is never sent to the client.
 * 422 on any error; never 500.
 */

import { logUsage } from '@/lib/usage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request body' }, 422);
  }

  const { tmdbId, kind, season } = body || {};

  if (!tmdbId) return json({ error: 'tmdbId is required' }, 422);
  if (!kind || (kind !== 'movie' && kind !== 'tv')) {
    return json({ error: 'kind must be "movie" or "tv"' }, 422);
  }

  try {
    const { getDetails } = await import('@/lib/tmdb.js');
    const item = await getDetails({
      tmdbId,
      kind,
      season: season != null ? Number(season) : undefined,
    });
    logUsage({ request, route: 'title', kind, ok: true, ms: Date.now() - startedAt });
    return json(item);
  } catch (err) {
    console.error('[/api/title]', err?.message || err);
    logUsage({ request, route: 'title', kind, ok: false, ms: Date.now() - startedAt });
    return json({ error: 'failed to fetch title details' }, 422);
  }
}
