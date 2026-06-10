/**
 * lib/providers.js — streaming-provider registry (GB region).
 * Shared constants + pure helpers; safe for client AND server imports.
 *
 * tmdbId values verified against TMDB /watch/providers (watch_region=GB).
 */

export const PROVIDERS = [
  { key: 'netflix', label: 'Netflix', tmdbId: 8, aliases: ['netflix'], bare: true },
  { key: 'prime', label: 'Prime Video', tmdbId: 9, aliases: ['prime video', 'prime', 'amazon'], bare: true },
  { key: 'disney', label: 'Disney+', tmdbId: 337, aliases: ['disney plus', 'disney+', 'disney'], bare: true },
  { key: 'apple', label: 'Apple TV+', tmdbId: 350, aliases: ['apple tv plus', 'apple tv+', 'apple tv', 'apple'], bare: true },
  { key: 'now', label: 'NOW', tmdbId: 39, aliases: ['now tv', 'nowtv', 'now'], bare: false },
  { key: 'iplayer', label: 'BBC iPlayer', tmdbId: 38, aliases: ['iplayer', 'bbc'], bare: true },
  { key: 'itvx', label: 'ITVX', tmdbId: 41, aliases: ['itvx', 'itv'], bare: true },
  { key: 'channel4', label: 'Channel 4', tmdbId: 103, aliases: ['channel 4', 'channel4'], bare: true },
  { key: 'paramount', label: 'Paramount+', tmdbId: 531, aliases: ['paramount plus', 'paramount+', 'paramount'], bare: true },
  { key: 'sky', label: 'Sky', tmdbId: 29, aliases: ['sky go', 'sky'], bare: false },
];

export function providerByKey(key) {
  return PROVIDERS.find((p) => p.key === key) || null;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Detect explicitly named services in a query ("something funny on netflix").
 * Ambiguous aliases (now, sky) only match in an "on <service>" construction so
 * "something to watch now" never reads as the NOW service.
 * Returns an array of provider objects (possibly empty).
 */
export function providersFromQuery(query) {
  const q = (query || '').toLowerCase();
  const found = [];
  for (const p of PROVIDERS) {
    const hit = p.aliases.some((a) => {
      const body = esc(a);
      const re = p.bare
        ? new RegExp(`(?:^|[^a-z0-9])${body}(?:$|[^a-z0-9])`)
        : new RegExp(`\\bon\\s+(?:the\\s+)?${body}(?:$|[^a-z0-9])`);
      return re.test(q);
    });
    if (hit) found.push(p);
  }
  return found;
}
