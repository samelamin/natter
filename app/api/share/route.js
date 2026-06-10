/**
 * /api/share — create a shareable set link.
 *   POST { query, intent?, kind?, picks[] } → { id }
 *
 * Rate-limited to 20 per IP per minute. Requires a database; 503 when unavailable.
 */

import { db, dbAvailable } from '@/lib/db.js';
import { rateLimited } from '@/lib/auth.js';
import { newShareId, sanitizeSetPicks, decodeKind } from '@/lib/shareset.js';

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

export async function POST(request) {
  if (!dbAvailable()) {
    return json({ error: 'sharing unavailable' }, 503);
  }

  // IP extraction: cf-connecting-ip → x-forwarded-for first value → 'local'
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'local';

  if (rateLimited(`share:${ip}`, { max: 20, windowMs: 60_000 })) {
    return json({ error: 'Easy there — try again in a minute.' }, 429);
  }

  // Parse body — malformed JSON must 400, never throw
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const query = String(body.query || '').trim().slice(0, 200);
  if (!query) {
    return json({ error: 'query required' }, 400);
  }

  const intentRaw = body.intent != null ? String(body.intent).slice(0, 300) : null;
  const intent = intentRaw || null;

  const kind = decodeKind(body.kind);

  const picks = sanitizeSetPicks(body.picks);
  if (!picks.length) {
    return json({ error: 'picks required' }, 400);
  }

  const id = newShareId();

  try {
    const pool = await db();
    await pool.query(
      `INSERT INTO shared_sets (id, query, intent, kind, picks)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, query, intent, kind, JSON.stringify(picks)],
    );
  } catch (err) {
    console.error('[/api/share POST]', err);
    return json({ error: 'could not create link' }, 500);
  }

  return json({ id });
}
