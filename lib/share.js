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

/**
 * Swap the size segment of a TMDB image path — proxied ("/img/w500/x.jpg") or
 * absolute ("https://image.tmdb.org/t/p/original/x.jpg"). OG images must use
 * small fixed sizes: full-res backdrops blow past WhatsApp's ~600KB preview
 * cap and the card silently never renders. Input without a recognisable size
 * segment is returned unchanged.
 * @param {string|null|undefined} src
 * @param {string} size  e.g. "w342", "w780"
 * @returns {string|null}
 */
export function resizeImagePath(src, size) {
  if (!src) return null;
  if (!size) return src;
  return String(src).replace(/\/(original|w\d+)\//, `/${size}/`);
}
