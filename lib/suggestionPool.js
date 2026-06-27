/**
 * lib/suggestionPool.js — the static suggestion-chip pool.
 *
 * Single source of truth shared by the idle screen (client) and the Redis
 * cache warmer (server). Lives outside the 'use client' module on purpose:
 * importing a const from a client module into server code yields a client
 * reference, not the value.
 */
export const POOL = [
  'A cosy whodunnit',
  "Something that'll make us cry",
  'Under 90 minutes',
  'A proper hidden gem',
  'Tense but not gory',
  'Something like Game of Thrones',
  'Will Ferrell comedies',
  '90s romcoms',
  'A French heist film',
  'Feel-good sci-fi',
  'A film to watch with my mum',
  'Korean thrillers',
  'فيلم كوميدي',
  'Animated, but for adults',
];

/**
 * Per-domain suggestion pools. Keys mirror the `kind` filter values used by
 * the UI (all | film | tv | book | game | recipe). `all` falls back to the
 * original POOL for backwards compatibility.
 *
 * 6 entries each — the idle screen renders the first 5 deterministically
 * (hydration safety) and randomises a fresh five after mount.
 */
export const POOL_BY_DOMAIN = {
  all: POOL,
  film: POOL,
  tv: [
    'A bingeable mystery series',
    'Something like Succession',
    'A cosy sitcom',
    'Prestige sci-fi',
    'A limited series under 8 eps',
    'A comfort rewatch show',
  ],
  book: [
    'A cosy mystery novel',
    'Sci-fi like Dune',
    'A short literary novel',
    'A page-turning thriller',
    'Feel-good non-fiction',
    'A modern fantasy epic',
  ],
  game: [
    'A relaxing cozy game',
    'Co-op games for two',
    'A story-rich RPG',
    'Something like Hollow Knight',
    'A short indie gem',
    'Couch multiplayer',
  ],
  recipe: [
    'A quick weeknight dinner',
    'Something with chicken',
    'A cosy vegetarian stew',
    'A 20-minute pasta',
    'Healthy meal-prep',
    'A showstopper dessert',
  ],
};