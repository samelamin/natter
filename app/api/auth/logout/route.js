/**
 * POST /api/auth/logout — destroys the session and clears the cookie.
 */

import { destroySession, sessionTokenFrom, sessionCookie } from '@/lib/auth.js';

export async function POST(request) {
  try {
    await destroySession(sessionTokenFrom(request));
  } catch (err) {
    console.warn('[/api/auth/logout]', err.message);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(null) },
  });
}
