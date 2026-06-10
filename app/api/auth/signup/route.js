/**
 * POST /api/auth/signup — { email, password } → sets session cookie.
 * 409 when the email is taken; 503 when accounts are unavailable (no DB).
 */

import { db, dbAvailable } from '@/lib/db.js';
import { hashPassword, createSession, sessionCookie, rateLimited } from '@/lib/auth.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  if (!dbAvailable()) return json({ error: 'Accounts are not available right now.' }, 503);

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  if (rateLimited(`signup:${ip}`, { max: 5, windowMs: 60_000 })) {
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
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }
  if (password.length < 8 || password.length > 200) {
    return json({ error: 'Password must be at least 8 characters.' }, 400);
  }

  try {
    const pool = await db();
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, services`,
      [email, passwordHash],
    );
    if (rows.length === 0) {
      return json({ error: 'That email already has an account — sign in instead.' }, 409);
    }
    const token = await createSession(rows[0].id);
    return json(
      { user: { email: rows[0].email, services: rows[0].services } },
      200,
      { 'Set-Cookie': sessionCookie(token) },
    );
  } catch (err) {
    console.error('[/api/auth/signup]', err.message);
    return json({ error: 'Could not create the account — please try again.' }, 500);
  }
}
