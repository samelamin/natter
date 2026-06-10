/**
 * lib/history.js — pure, client-safe helpers for recommendation history.
 *
 * NO server-only imports: no db, no auth, no process.env access.
 * Safe to import from both server components and client code.
 */

/**
 * Sanitize an array of pick objects coming from untrusted input (e.g. API
 * request body or DB reads before returning to the client).
 *
 * - Returns [] for any non-array / null / undefined input.
 * - Caps at 10 entries.
 * - Each output entry has exactly:
 *     { id, tmdbId, kind, title, poster, year, rating, reason }
 * - Entries missing a valid positive integer tmdbId are dropped.
 * - kind: anything that isn't 'tv' becomes 'film'.
 * - title: String, truncated to 200 chars.
 * - poster: String truncated to 500 chars or null.
 * - year: integer or null.
 * - rating: number or null.
 * - reason: String truncated to 280 chars or null.
 * - id: String, truncated to 32 chars.
 */
export function sanitizeHistoryPicks(picks) {
  if (!Array.isArray(picks)) return [];

  const out = [];
  for (const pick of picks) {
    if (out.length >= 10) break;
    if (!pick || typeof pick !== 'object') continue;

    const tmdbId = Number(pick.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;

    const id = String(pick.id || '').slice(0, 32);
    const kind = pick.kind === 'tv' ? 'tv' : 'film';
    const title = String(pick.title || '').slice(0, 200);
    const poster = pick.poster ? String(pick.poster).slice(0, 500) : null;
    const year = Number.isInteger(pick.year) ? pick.year : null;
    const rating = typeof pick.rating === 'number' ? pick.rating : null;
    const reason = pick.reason ? String(pick.reason).slice(0, 280) : null;

    out.push({ id, tmdbId, kind, title, poster, year, rating, reason });
  }

  return out;
}

/**
 * Coerce raw (number or numeric string) to a positive integer id, or null.
 *
 * Valid: positive integers and their string representations (7, '7').
 * Invalid (→ null): null, undefined, NaN, 0, negatives, floats, non-numeric strings.
 *
 * @param {*} raw
 * @returns {number|null}
 */
export function historyIdFrom(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Return a display label for a history entry.
 * Never throws — returns '' when the entry or its query is missing.
 *
 * @param {object|null|undefined} entry
 * @returns {string}
 */
export function historyLabel(entry) {
  try {
    return String(entry?.query || '').trim();
  } catch {
    return '';
  }
}
