/**
 * /api/watchlist/export — download the signed-in user's watchlist as CSV.
 *   GET → text/csv attachment (Letterboxd/Trakt-compatible)
 * 401 without a session.
 */

import { db } from '@/lib/db.js';
import { getSessionUser } from '@/lib/auth.js';
import { watchlistToCsv } from '@/lib/watchlistCsv.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  try {
    const pool = await db();
    const { rows } = await pool.query(
      `SELECT tmdb_id, kind, title, year, watched, added_at
       FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC`,
      [user.id],
    );
    const items = rows.map((r) => ({
      tmdbId: Number(r.tmdb_id),
      kind: r.kind,
      title: r.title,
      year: r.year ?? undefined,
      watched: r.watched === true,
      addedAt: r.added_at,
    }));
    return new Response(watchlistToCsv(items), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="natter-watchlist.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/watchlist/export]', err.message);
    return json({ error: 'could not export watchlist' }, 500);
  }
}
