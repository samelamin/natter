/**
 * lib/shareset.js — pure share-set logic.
 *
 * Server-safe: uses node:crypto only.
 * Do NOT import db, tmdb, or process.env here — tests must run without those.
 */

import { randomBytes } from 'node:crypto';

// Base62 alphabet: digits + uppercase + lowercase
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generate a 12-character base62 share ID from 9 random bytes.
 * Unguessable and URL-safe.
 * @returns {string}
 */
export function newShareId() {
  // 9 random bytes (72 bits) packed into exactly 12 base62 digits. 62^12 is
  // slightly under 2^72, so the top of the range wraps — irrelevant for an
  // unguessable share id (~72 bits of entropy either way).
  const bytes = randomBytes(9);
  let n = 0n;
  for (let i = 0; i < 9; i++) {
    n = (n << 8n) | BigInt(bytes[i]);
  }
  const chars = [];
  for (let i = 0; i < 12; i++) {
    chars.push(BASE62[Number(n % 62n)]);
    n = n / 62n;
  }
  return chars.reverse().join('');
}

/**
 * Sanitize an array of picks for storage.
 * @param {unknown} picks
 * @returns {{ tmdbId: number, kind: 'film'|'tv', title: string, year: number|null, poster: string|null }[]}
 */
export function sanitizeSetPicks(picks) {
  if (!Array.isArray(picks)) return [];

  const out = [];
  for (const p of picks) {
    if (!p || typeof p !== 'object') continue;

    // tmdbId: must be a finite integer (discard float strings, floats, NaN, etc.)
    const rawId = p.tmdbId;
    const numId = typeof rawId === 'number' ? rawId : Number(rawId);
    if (!Number.isInteger(numId)) continue;

    // kind: 'tv' or anything else → 'film'
    const kind = p.kind === 'tv' ? 'tv' : 'film';

    // title: string, sliced to 200
    const title = String(p.title ?? '').slice(0, 200);

    // year: integer or null
    let year = null;
    if (p.year != null) {
      const y = Math.trunc(Number(p.year));
      year = Number.isFinite(y) ? y : null;
    }

    // poster: only same-origin proxied paths. /api/share is unauthenticated,
    // so an arbitrary string here becomes a stored off-origin <img src> (and
    // og:image) on the public /s page. Legitimate posters are always '/img/…'.
    const poster =
      typeof p.poster === 'string' && p.poster.startsWith('/img/')
        ? p.poster.slice(0, 500)
        : null;

    out.push({ tmdbId: numId, kind, title, year, poster });

    if (out.length >= 8) break;
  }

  return out;
}

/**
 * Decode a kind string from request body.
 * 'tv' → 'tv', 'film' → 'film', anything else → 'all'.
 * @param {unknown} k
 * @returns {'tv'|'film'|'all'}
 */
export function decodeKind(k) {
  if (k === 'tv') return 'tv';
  if (k === 'film') return 'film';
  return 'all';
}
