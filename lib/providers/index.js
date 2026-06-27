/**
 * lib/providers/index.js — domain-provider registry.
 *
 * Aggregates the per-domain provider modules (book, game, recipe) and
 * exposes the unified DOMAIN_META map (label / accent / verb per domain,
 * covering the original film + tv too) so the UI + agent have a single
 * source of truth.
 */

import * as book from './books.js';
import * as game from './games.js';
import * as recipe from './recipes.js';

export const PROVIDERS = { book, game, recipe };

/** Domains the recommendation engine can target in this wave. */
export const NEW_DOMAINS = ['book', 'game', 'recipe'];

/**
 * Return the provider module for a domain, or null if unsupported.
 * @param {string} domain  e.g. 'book', 'game', 'recipe'
 */
export function getProvider(domain) {
  return PROVIDERS[domain] || null;
}

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