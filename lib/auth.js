/**
 * lib/auth.js — server-only password + cookie-session auth.
 * NEVER import from client code.
 *
 * Design: scrypt password hashes (node:crypto, no extra deps); opaque random
 * session tokens in an httpOnly cookie; the DATABASE stores only sha256(token)
 * so a leaked dump contains no usable sessions.
 */

import { randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE = 'natter_session';
const SESSION_TTL_DAYS = 90;

// ── Passwords ────────────────────────────────────────────────────────────────

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const dk = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${dk.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const dk = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

// A valid scrypt hash of a throwaway secret. Login verifies against this when the
// email is unknown, so a real scrypt always runs and response timing can't be
// used to enumerate which emails have accounts.
export const DUMMY_PASSWORD_HASH = (() => {
  const salt = randomBytes(16);
  const dk = scryptSync(randomBytes(24).toString('hex'), salt, 64);
  return `scrypt:${salt.toString('hex')}:${dk.toString('hex')}`;
})();

// ── Sessions ─────────────────────────────────────────────────────────────────

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a DB session row; returns the raw token for the cookie. */
export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const pool = await db();
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '${SESSION_TTL_DAYS} days')`,
    [hashToken(token), userId],
  );
  return token;
}

export async function destroySession(token) {
  if (!token) return;
  const pool = await db();
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Parse the session cookie value from a Request. Exported for tests. */
export function sessionTokenFrom(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=') || null;
  }
  return null;
}

/** Resolve the signed-in user ({id, email, services}) or null. Never throws. */
export async function getSessionUser(request) {
  try {
    if (!process.env.DATABASE_URL) return null;
    const token = sessionTokenFrom(request);
    if (!token) return null;
    const pool = await db();
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.services
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    return rows[0] || null;
  } catch (err) {
    console.warn('[auth] session lookup failed:', err.message);
    return null;
  }
}

/** Set-Cookie header value for a fresh session (or '' to clear). */
export function sessionCookie(token) {
  const base = `${SESSION_COOKIE}=${token || ''}; Path=/; HttpOnly; SameSite=Lax`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const age = token ? `; Max-Age=${SESSION_TTL_DAYS * 24 * 3600}` : '; Max-Age=0';
  return base + secure + age;
}

// ── Tiny in-memory rate limiter (per-process; fine for one container) ────────

const _hits = new Map(); // key → [timestamps]

/** True when `key` exceeded `max` events in the trailing `windowMs`. */
export function rateLimited(key, { max = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 10_000) _hits.clear(); // crude memory guard
  return arr.length > max;
}
