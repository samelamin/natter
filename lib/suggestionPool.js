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
