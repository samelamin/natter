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

// DOMAIN_META + NEW_DOMAINS live in the import-free lib/domains.js so the UI can
// use them without pulling the provider modules (and Redis) into the client
// bundle. Re-exported here for server consumers that already import the registry.
export { DOMAIN_META, NEW_DOMAINS } from '../domains.js';

export const PROVIDERS = { book, game, recipe };

/**
 * Return the provider module for a domain, or null if unsupported.
 * @param {string} domain  e.g. 'book', 'game', 'recipe'
 */
export function getProvider(domain) {
  return PROVIDERS[domain] || null;
}