/**
 * /api/history — signed-in user's recommendation history.
 *   GET  → { items: [{ id, query, intent, kind, picks, createdAt }] }
 *   POST { query, intent, kind, picks } → save + prune to 20 rows → { ok:true, id }
 * 401 without a session.
 */

import { db } from '@/lib/db.js';
import { getSessionUser, rateLimited } from '@/lib/auth.js';
import { sanitizeHistoryPicks, historyIdFrom } from '@/lib/history.js';

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
      `SELECT id, query, intent, kind, picks, created_at
       FROM rec_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 12`,
      [user.id],
    );
    return json({
      items: rows.map((r) => ({
        id: Number(r.id),
        query: r.query,
        intent: r.intent,
        kind: r.kind,
        picks: r.picks,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[/api/history GET]', err);
    return json({ error: 'could not load history' }, 500);
  }
}

export async function DELETE(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);

  if (rateLimited(`hist:${user.id}`, { max: 30, windowMs: 60_000 })) {
    return json({ error: 'Slow down a moment.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request body' }, 400);
  }

  const id = historyIdFrom(body.id);
  if (id === null) return json({ error: 'id required' }, 400);

  try {
    const pool = await db();
    const { rowCount } = await pool.query(
      `DELETE FROM rec_history WHERE user_id = $1 AND id = $2`,
      [user.id, id],
    );
    if (rowCount === 0) return json({ error: 'not found' }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error('[/api/history DELETE]', err);
    return json({ error: 'could not delete' }, 500);
  }
}

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);

  if (rateLimited(`hist:${user.id}`, { max: 30, windowMs: 60_000 })) {
    return json({ error: 'Slow down a moment.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request body' }, 400);
  }

  const query = String(body.query || '').trim().slice(0, 500);
  if (!query) return json({ error: 'query required' }, 400);

  const kindRaw = body.kind;
  const kind = kindRaw === 'film' || kindRaw === 'tv' || kindRaw === 'all' ? kindRaw : null;

  const intent = body.intent ? String(body.intent).slice(0, 500) : null;

  const picks = sanitizeHistoryPicks(body.picks);
  if (picks.length === 0) return json({ error: 'picks required' }, 400);

  try {
    const pool = await db();
    const { rows } = await pool.query(
      `INSERT INTO rec_history (user_id, query, intent, kind, picks)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.id, query, intent, kind, JSON.stringify(picks)],
    );
    const id = Number(rows[0].id);

    // Prune: keep only the 20 most recent rows for this user.
    await pool.query(
      `DELETE FROM rec_history
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM rec_history
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 20
         )`,
      [user.id],
    );

    return json({ ok: true, id });
  } catch (err) {
    console.error('[/api/history POST]', err);
    return json({ error: 'could not save' }, 500);
  }
}
