/**
 * POST /api/trakt/connect
 * Starts the Trakt device-code flow for the signed-in user.
 * Returns {user_code, verification_url, expires_in, interval, device_code}.
 */

import { getSessionUser, rateLimited } from '@/lib/auth.js';
import { dbAvailable } from '@/lib/db.js';
import { traktConfigured, startDeviceFlow } from '@/lib/trakt.js';

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
    const flow = await startDeviceFlow();
    return json({
      user_code: flow.user_code,
      verification_url: flow.verification_url,
      expires_in: flow.expires_in,
      interval: flow.interval,
      device_code: flow.device_code,
    });
  } catch (err) {
    console.error('[/api/trakt/connect]', err.message);
    return json({ error: 'Could not start Trakt connection — try again.' }, 502);
  }
}
