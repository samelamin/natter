/**
 * lib/share.js — pure share-link helpers.
 *
 * Client-safe: this MUST NOT import lib/tmdb.js, read process.env, or touch
 * next/og — it is bundled into the client via ShareButton.
 */

/**
 * Canonical share path for a pick. Returns null when there's no tmdbId, so the
 * caller can hide the share affordance rather than emit "/title/film/undefined".
 * @param {{ tmdbId?: number|string, kind?: 'film'|'tv' } | null | undefined} pick
 * @returns {string|null}  e.g. "/title/film/693134"
 */
export function shareUrlFor(pick) {
  if (!pick || pick.tmdbId == null) return null;
  const kind = pick.kind === 'tv' ? 'tv' : 'film';
  return `/title/${kind}/${pick.tmdbId}`;
}
