/**
 * PUT /api/account/services — { services: ['netflix', 'prime', ...] }
 * Saves the signed-in user's streaming services (provider keys from
 * lib/providers.js). These switch on availability-aware recommendations.
 */

import { db } from '@/lib/db.js';
import { getSessionUser } from '@/lib/auth.js';
import { providerByKey } from '@/lib/providers.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function PUT(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request body' }, 400);
  }
  const services = Array.isArray(body?.services)
    ? [...new Set(body.services.map(String))].filter((k) => providerByKey(k)).slice(0, 20)
    : null;
  if (!services) return json({ error: 'services must be an array of provider keys' }, 400);

  try {
    const pool = await db();
    const { rows } = await pool.query(
      'UPDATE users SET services = $1 WHERE id = $2 RETURNING email, services',
      [services, user.id],
    );
    return json({ user: rows[0] });
  } catch (err) {
    console.error('[/api/account/services]', err.message);
    return json({ error: 'could not save services' }, 500);
  }
}
