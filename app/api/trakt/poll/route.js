/**
 * POST /api/trakt/poll { device_code }
 * Polls Trakt for device-token approval.
 *   {connected:true, traktUser}     — approved
 *   {pending:true}                  — still waiting
 *   {pending:true, slowDown:true}   — slow down polling
 *   {error:'expired'|'denied'|'invalid'} — terminal error
 */

import { getSessionUser, rateLimited } from '@/lib/auth.js';
import { db, dbAvailable } from '@/lib/db.js';
import { traktConfigured, pollDeviceToken, saveTokens, apiGet, traktHeaders } from '@/lib/trakt.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function getTraktUsername(accessToken) {
  try {
    const res = await apiGet('/users/settings', traktHeaders(process.env.TRAKT_CLIENT_ID, accessToken));
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.username || null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return json({ error: 'sign in required' }, 401);
  if (!dbAvailable()) return json({ error: 'unavailable' }, 503);
  if (!traktConfigured()) return json({ error: 'Trakt is not configured on this server.' }, 503);
  if (rateLimited(`trakt:${user.id}`, { max: 30, windowMs: 60_000 })) {
    return json({ error: 'Slow down a moment.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request body' }, 400);
  }

  const deviceCode = String(body?.device_code || '').trim();
  if (!deviceCode) return json({ error: 'device_code is required' }, 400);

  try {
    const tokenPayload = await pollDeviceToken(deviceCode);
    // state === 'ok' — got the token
    const traktUser = await getTraktUsername(tokenPayload.access_token);
    const pool = await db();
    await saveTokens(pool, user.id, tokenPayload, traktUser);
    return json({ connected: true, traktUser });
  } catch (err) {
    const state = err.traktState;
    if (state === 'pending') return json({ pending: true });
    if (state === 'slow_down') return json({ pending: true, slowDown: true });
    if (state === 'expired') return json({ error: 'expired' });
    if (state === 'denied') return json({ error: 'denied' });
    if (state === 'invalid') return json({ error: 'invalid' });
    // Unexpected error
    console.error('[/api/trakt/poll]', err.message);
    return json({ error: 'poll failed — try again' }, 502);
  }
}
