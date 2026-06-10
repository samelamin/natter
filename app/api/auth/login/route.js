/**
 * POST /api/auth/login — { email, password } → sets session cookie.
 * Always answers invalid credentials with the same generic 401.
 */

import { db, dbAvailable } from '@/lib/db.js';
import { verifyPassword, createSession, sessionCookie, rateLimited, DUMMY_PASSWORD_HASH } from '@/lib/auth.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export async function POST(request) {
  if (!dbAvailable()) return json({ error: 'Accounts are not available right now.' }, 503);

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  if (rateLimited(`login:${ip}`, { max: 10, windowMs: 60_000 })) {
    return json({ error: 'Too many attempts — try again in a minute.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request body' }, 400);
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');

  try {
    const pool = await db();
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, services FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    // Always run the scrypt — against a dummy hash when the email is unknown — so
    // response timing can't reveal whether an account exists.
    const ok = await verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user || !ok) return json({ error: 'Wrong email or password.' }, 401);

    const token = await createSession(user.id);
    return json(
      { user: { email: user.email, services: user.services } },
      200,
      { 'Set-Cookie': sessionCookie(token) },
    );
  } catch (err) {
    console.error('[/api/auth/login]', err.message);
    return json({ error: 'Could not sign in — please try again.' }, 500);
  }
}
