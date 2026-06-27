/**
 * lib/share.js — pure share-link helpers.
 *
 * Client-safe: this MUST NOT import lib/tmdb.js, read process.env, or touch
 * next/og — it is bundled into the client via ShareButton.
 */

const NEW_DOMAINS = new Set(['book', 'game', 'recipe']);

/**
 * Canonical share path for a pick.
 *
 *  - film/tv:    `/title/{kind}/{tmdbId}` — resolves to the rich detail page
 *                (app/title/[kind]/[id]/page.jsx).
 *  - book/game/  `/?kind={domain}&q={title}` — no per-item page exists yet
 *    recipe:     for these domains, so we deep-link the recipient to a
 *                search that will re-surface the same recommendation. The
 *                URL is safe to share (no PII) and round-trips through the
 *                home page's existing ?q= handler.
 *  - anything    null (no share affordance should render).
 *    else:
 *
 * @param {{ tmdbId?: number|string, kind?: 'film'|'tv', domain?: string, title?: string } | null | undefined} pick
 * @returns {string|null}  e.g. "/title/film/693134", "/?kind=book&q=Dune", or null
 */
export function shareUrlFor(pick) {
  if (!pick) return null;
  // New domains first — they don't have a tmdbId, so the legacy branch below
  // would misclassify them as missing. Only fall back to the title search if
  // we actually have a title to deep-link.
  if (pick.domain && NEW_DOMAINS.has(pick.domain)) {
    const title = (pick.title || '').toString().trim();
    if (!title) return null;
    const params = new URLSearchParams({ kind: pick.domain, q: title });
    return `/?${params.toString()}`;
  }
  if (pick.tmdbId == null) return null;
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
