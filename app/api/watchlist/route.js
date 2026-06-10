/**
 * /api/watchlist — the signed-in user's saved titles.
 *   GET    → { items: [{ tmdbId, kind, title, poster, year, rating, addedAt }] }
 *   POST   { tmdbId, kind, title, poster?, year?, rating? } → upsert
 *   DELETE { tmdbId, kind } → remove
 * 401 without a session.
 */

import { db } from '@/lib/db.js';
import { getSessionUser, rateLimited } from '@/lib/auth.js';

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
      `SELECT tmdb_id, kind, title, poster, year, rating, added_at
       FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC LIMIT 500`,
      [user.id],
    );
    return json({
      items: rows.map((r) => ({
        tmdbId: Number(r.tmdb_id),
        kind: r.kind,
        title: r.title,
        poster: r.poster,
        year: r.year ?? undefined,
        rating: r.rating ?? undefined,
        addedAt: r.added_at,
      })),
    });
  } catch (err) {
    console.error('[/api/watchlist GET]', err.message);
    return json({ error: 'could not load watchlist' }, 500);
  }
}

async function parseItem(request) {
  const body = await request.json();
  const tmdbId = Number(body?.tmdbId);
  const kind = body?.kind === 'tv' ? 'tv' : body?.kind === 'film' ? 'film' : null;
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !kind) return null;
  return { tmdbId, kind, body };
}

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  if (rateLimited('wl:' + user.id, { max: 60, windowMs: 60_000 })) return json({ error: 'Slow down a moment.' }, 429);
  try {
    const item = await parseItem(request);
    if (!item) return json({ error: 'tmdbId and kind are required' }, 400);
    const title = String(item.body.title || '').slice(0, 300);
    if (!title) return json({ error: 'title is required' }, 400);
    const poster = item.body.poster ? String(item.body.poster).slice(0, 500) : null;
    const year = Number.isInteger(item.body.year) ? item.body.year : null;
    const rating = typeof item.body.rating === 'number' ? item.body.rating : null;

    const pool = await db();
    await pool.query(
      `INSERT INTO watchlist (user_id, tmdb_id, kind, title, poster, year, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, tmdb_id, kind) DO NOTHING`,
      [user.id, item.tmdbId, item.kind, title, poster, year, rating],
    );
    return json({ ok: true });
  } catch (err) {
    console.error('[/api/watchlist POST]', err.message);
    return json({ error: 'could not save' }, 500);
  }
}

export async function DELETE(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  if (rateLimited('wl:' + user.id, { max: 60, windowMs: 60_000 })) return json({ error: 'Slow down a moment.' }, 429);
  try {
    const item = await parseItem(request);
    if (!item) return json({ error: 'tmdbId and kind are required' }, 400);
    const pool = await db();
    await pool.query(
      'DELETE FROM watchlist WHERE user_id = $1 AND tmdb_id = $2 AND kind = $3',
      [user.id, item.tmdbId, item.kind],
    );
    return json({ ok: true });
  } catch (err) {
    console.error('[/api/watchlist DELETE]', err.message);
    return json({ error: 'could not remove' }, 500);
  }
}
