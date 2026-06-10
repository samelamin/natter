/**
 * lib/watchlistItem.js — pure, client-safe helpers for watchlist items.
 * Zero imports. No server-only APIs.
 */

/**
 * Convert a raw item object into the body expected by POST /api/watchlist.
 *
 * Returns null when the item is nullish or tmdbId is missing / not an integer
 * (or an integer-valued numeric string like "27205").
 *
 * @param {object|null|undefined} item
 * @returns {{ tmdbId: number, kind: 'tv'|'film', title: string, poster: string|null, year: number|null, rating: number|null }|null}
 */
export function toWatchlistBody(item) {
  if (item == null) return null;

  // tmdbId must coerce to a finite integer
  const tmdbId = Number(item.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId !== tmdbId /* NaN guard */) return null;
  // Reject values that only became integer after float truncation (e.g. 1.5 → 1)
  // Number() of an integer string like "27205" is already integer, fine.
  // But Number(NaN) is NaN, caught above; Number("abc") is NaN, caught above.
  // We also need to ensure the original value wasn't something like 1.5 that
  // happens to coerce cleanly — but Number.isInteger(1.5) is false, so we're fine.

  // kind: 'tv' stays 'tv'; anything else ('movie', 'film', undefined, …) → 'film'
  const kind = item.kind === 'tv' ? 'tv' : 'film';

  // title: stringify, default '', max 300 chars
  const title = String(item.title != null ? item.title : '').slice(0, 300);

  // poster: item.poster ?? item.posterSrc ?? null, max 500 chars
  const rawPoster = item.poster != null ? item.poster : (item.posterSrc != null ? item.posterSrc : null);
  const poster = rawPoster != null ? String(rawPoster).slice(0, 500) : null;

  // year: must be an integer
  const rawYear = item.year;
  const year = Number.isInteger(rawYear) ? rawYear : null;

  // rating: must be a number (typeof check, not isInteger — decimals allowed)
  const rawRating = item.rating;
  const rating = typeof rawRating === 'number' ? rawRating : null;

  return { tmdbId, kind, title, poster, year, rating };
}
