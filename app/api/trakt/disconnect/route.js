/**
 * POST /api/trakt/disconnect
 * Removes the user's Trakt token row (keeps trakt_watched — historical exclusions remain valid).
 * Returns {ok:true}.
 */

import { getSessionUser, rateLimited } from '@/lib/auth.js';
import { db, dbAvailable } from '@/lib/db.js';
import { traktConfigured } from '@/lib/trakt.js';

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
    await pool.query('DELETE FROM trakt_tokens WHERE user_id = $1', [user.id]);
    // trakt_watched rows are intentionally kept — they continue to feed the exclusion set.
    return json({ ok: true });
  } catch (err) {
    console.error('[/api/trakt/disconnect]', err.message);
    return json({ error: 'could not disconnect — try again' }, 500);
  }
}
