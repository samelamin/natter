/**
 * lib/domains.js — client-safe domain constants.
 *
 * Pure data, ZERO imports. Lives apart from lib/providers/index.js because the
 * provider modules pull in the Redis cache (a Node-only dependency); importing
 * DOMAIN_META from the registry into a 'use client' file would drag Redis into
 * the browser bundle. UI code imports from here; server code may use either.
 */

/** Domains the new (non-TMDB) recommendation engine can target. */
export const NEW_DOMAINS = ['book', 'game', 'recipe'];

/**
 * Display metadata used by both UI and agent. Single source of truth —
 * edit here when a domain gets a new accent / verb.
 */
export const DOMAIN_META = {
  film:   { label: 'Films',   accent: '#7C6CFF', verb: 'watch' },
  tv:     { label: 'TV',      accent: '#7C6CFF', verb: 'watch' },
  book:   { label: 'Books',   accent: '#E8A94B', verb: 'read'  },
  game:   { label: 'Games',   accent: '#5BC8AF', verb: 'play'  },
  recipe: { label: 'Recipes', accent: '#F2766B', verb: 'cook'  },
};
