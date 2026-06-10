/**
 * lib/sharetext.js — pure share-text helpers.
 *
 * Client-safe: ZERO imports. No Node, no Next.js, no external deps.
 */

/**
 * Build the human-readable share text for a title item.
 * Format: "{title} ({year}) — found on Natter. {reason<=90}"
 * When title is missing/falsy, returns 'Found on Natter.'.
 *
 * @param {{ title?: string|null, year?: number|null, reason?: string|null } | null | undefined} item
 * @returns {string}
 */
export function shareTextFor(item) {
  if (!item) return 'Found on Natter.';
  const title = item.title ? String(item.title) : '';
  if (!title) return 'Found on Natter.';
  const yearPart = item.year ? ` (${item.year})` : '';
  const reasonPart = item.reason ? ' ' + String(item.reason).slice(0, 90) : '';
  return `${title}${yearPart} — found on Natter.${reasonPart}`;
}

/**
 * Build the share target URLs for WhatsApp, X (Twitter), and Facebook.
 * X keeps the URL out of the text param (uses separate &url= param).
 * Facebook's sharer ignores custom text — it uses OG tags on the page.
 *
 * @param {{ url: string, text: string }} opts
 * @returns {{ whatsapp: string, x: string, facebook: string }}
 */
export function buildTargets({ url = '', text = '' } = {}) {
  const safeUrl = url ? String(url) : '';
  const safeText = text ? String(text) : '';

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(safeText + (safeText && safeUrl ? ' ' : '') + safeUrl)}`;
  const x = `https://x.com/intent/tweet?text=${encodeURIComponent(safeText)}&url=${encodeURIComponent(safeUrl)}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(safeUrl)}`;

  return { whatsapp, x, facebook };
}
