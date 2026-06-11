/**
 * GET /api/trakt/status
 * Returns the Trakt connection status for the signed-in user.
 * {configured, connected, traktUser, watchedCount, lastSync}
 * If !configured: {configured:false} with 200 — renders nothing in the UI.
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

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  if (!dbAvailable()) return json({ error: 'unavailable' }, 503);

  // configured:false → UI renders nothing; no 503 for this case.
  if (!traktConfigured()) return json({ configured: false });

  if (rateLimited(`trakt:${user.id}`, { max: 30, windowMs: 60_000 })) {
    return json({ error: 'Slow down a moment.' }, 429);
  }

  try {
    const pool = await db();
    const [tokenRes, watchedRes] = await Promise.all([
      pool.query(
        'SELECT trakt_user, updated_at FROM trakt_tokens WHERE user_id = $1',
        [user.id],
      ),
      pool.query(
        'SELECT count(*)::int AS cnt FROM trakt_watched WHERE user_id = $1',
        [user.id],
      ),
    ]);

    const connected = tokenRes.rows.length > 0;
    const traktUser = tokenRes.rows[0]?.trakt_user || null;
    const lastSync = tokenRes.rows[0]?.updated_at || null;
    const watchedCount = watchedRes.rows[0]?.cnt ?? 0;

    return json({ configured: true, connected, traktUser, watchedCount, lastSync });
  } catch (err) {
    console.error('[/api/trakt/status]', err.message);
    return json({ error: 'could not load status' }, 500);
  }
}
