/**
 * POST /api/trakt/sync
 * (a) Push user's unwatched watchlist items to Trakt.
 * (b) Pull watched history from Trakt → replace trakt_watched rows.
 * (c) Mark matching Natter watchlist items as watched.
 * Returns {ok:true, pushed:N, watchedImported:M, markedWatched:K}
 */

import { getSessionUser, rateLimited } from '@/lib/auth.js';
import { db, dbAvailable } from '@/lib/db.js';
import {
  traktConfigured,
  withAccessToken,
  buildWatchlistPayload,
  extractWatchedIds,
  apiGet,
  apiPost,
  traktHeaders,
} from '@/lib/trakt.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  if (!dbAvailable()) return json({ error: 'unavailable' }, 503);
  if (!traktConfigured()) return json({ error: 'Trakt is not configured on this server.' }, 503);
  if (rateLimited(`trakt:${user.id}`, { max: 30, windowMs: 60_000 })) {
    return json({ error: 'Slow down a moment.' }, 429);
  }

  try {
    const pool = await db();

    // ── (a) Push unwatched watchlist to Trakt ──────────────────────────────
    const { rows: watchlistRows } = await pool.query(
      'SELECT tmdb_id, kind FROM watchlist WHERE user_id = $1 AND watched = false LIMIT 500',
      [user.id],
    );
    const items = watchlistRows.map((r) => ({ tmdbId: Number(r.tmdb_id), kind: r.kind }));
    const payload = buildWatchlistPayload(items);
    const pushed = payload.movies.length + payload.shows.length;

    // ── (b) Pull watched history from Trakt ───────────────────────────────
    // Both push and pull share a single withAccessToken call to avoid double-refresh.
    let watchedItems = [];
    const syncResult = await withAccessToken(pool, user.id, async (accessToken) => {
      const headers = traktHeaders(process.env.TRAKT_CLIENT_ID, accessToken);

      // Push (fire-and-forget on partial failure — non-fatal)
      if (pushed > 0) {
        const pushRes = await apiPost('/sync/watchlist', payload, headers).catch(() => null);
        if (pushRes && !pushRes.ok) {
          console.warn('[/api/trakt/sync] watchlist push returned', pushRes.status);
        }
      }

      // Pull
      const [moviesRes, showsRes] = await Promise.all([
        apiGet('/sync/watched/movies', headers),
        apiGet('/sync/watched/shows', headers),
      ]);
      const movies = moviesRes.ok ? await moviesRes.json() : [];
      const shows = showsRes.ok ? await showsRes.json() : [];
      return extractWatchedIds(movies, shows);
    });

    if (syncResult === null) {
      // withAccessToken returned null — token expired and row was deleted
      return json({ error: 'Trakt connection expired — reconnect.' }, 401);
    }

    watchedItems = syncResult;

    // ── Replace trakt_watched rows (DELETE + bulk INSERT) ─────────────────
    await pool.query('DELETE FROM trakt_watched WHERE user_id = $1', [user.id]);

    const watchedImported = watchedItems.length;
    if (watchedImported > 0) {
      const placeholders = [];
      const values = [];
      let i = 1;
      for (const w of watchedItems) {
        placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`);
        values.push(user.id, w.tmdbId, w.kind, w.watchedAt || null);
        i += 4;
      }
      await pool.query(
        `INSERT INTO trakt_watched (user_id, tmdb_id, kind, watched_at) VALUES ${placeholders.join(', ')}
         ON CONFLICT (user_id, tmdb_id, kind) DO NOTHING`,
        values,
      );
    }

    // ── (c) Mark matching watchlist items as watched ───────────────────────
    const { rowCount: markedWatched } = await pool.query(
      `UPDATE watchlist SET watched = true
       WHERE user_id = $1
         AND watched = false
         AND (tmdb_id, kind) IN (
           SELECT tmdb_id, kind FROM trakt_watched WHERE user_id = $1
         )`,
      [user.id],
    );

    return json({ ok: true, pushed, watchedImported, markedWatched: markedWatched ?? 0 });
  } catch (err) {
    console.error('[/api/trakt/sync]', err.message);
    return json({ error: 'sync failed — try again' }, 500);
  }
}
