/**
 * lib/domainClassify.js — Domain keyword/verb router (pure, no I/O)
 * 
 * classifyDomain(query, selectedKind) → { domain, switched, from }
 * 
 * Domains: book | game | recipe | film | tv | all
 * selectedKind: any of the above
 */

// Explicit domain nouns (longest first to prevent "video game" → "game" mismatch)
const EXPLICIT_NOUNS = [
  { token: 'video game', domain: 'game' },
  { token: 'non-fiction', domain: 'book' },
  { token: 'audiobook', domain: 'book' },
  { token: 'audiobooks', domain: 'book' },
  { token: 'vegan recipe', domain: 'recipe' },
  { token: 'what to make', domain: 'recipe' },
  { token: 'what to cook', domain: 'recipe' },
  { token: 'bookshelf', domain: 'book' },
  { token: 'playstation', domain: 'game' },
  { token: 'nintendo', domain: 'game' },
  { token: 'multiplayer', domain: 'game' },
  { token: 'roguelike', domain: 'game' },
  { token: 'hardback', domain: 'book' },
  { token: 'paperback', domain: 'book' },
  { token: 'chapters', domain: 'book' },
  { token: 'chapter', domain: 'book' },
  { token: 'memoir', domain: 'book' },
  { token: 'memoirs', domain: 'book' },
  { token: 'fiction', domain: 'book' },
  { token: 'novel', domain: 'book' },
  { token: 'novels', domain: 'book' },
  { token: 'author', domain: 'book' },
  { token: 'authors', domain: 'book' },
  { token: 'books', domain: 'book' },
  { token: 'book', domain: 'book' },
  { token: 'gaming', domain: 'game' },
  { token: 'co-op', domain: 'game' },
  { token: 'xbox', domain: 'game' },
  { token: 'ps5', domain: 'game' },
  { token: 'ps4', domain: 'game' },
  { token: 'steam', domain: 'game' },
  { token: 'switch', domain: 'game' },
  { token: 'games', domain: 'game' },
  { token: 'game', domain: 'game' },
  { token: 'rpg', domain: 'game' },
  { token: 'fps', domain: 'game' },
  { token: 'recipes', domain: 'recipe' },
  { token: 'recipe', domain: 'recipe' },
  { token: 'cooking', domain: 'recipe' },
  { token: 'baking', domain: 'recipe' },
  { token: 'bake', domain: 'recipe' },
  { token: 'cuisine', domain: 'recipe' },
  { token: 'ingredients', domain: 'recipe' },
  { token: 'ingredient', domain: 'recipe' },
  { token: 'breakfast', domain: 'recipe' },
  { token: 'dinner', domain: 'recipe' },
  { token: 'lunch', domain: 'recipe' },
  { token: 'meals', domain: 'recipe' },
  { token: 'meal', domain: 'recipe' },
  { token: 'dishes', domain: 'recipe' },
  { token: 'dish', domain: 'recipe' },
  { token: 'movies', domain: 'film' },
  { token: 'movie', domain: 'film' },
  { token: 'films', domain: 'film' },
  { token: 'film', domain: 'film' },
  { token: 'cinema', domain: 'film' },
  { token: 'netflix', domain: 'film' },
  { token: 'episodes', domain: 'tv' },
  { token: 'episode', domain: 'tv' },
  { token: 'seasons', domain: 'tv' },
  { token: 'season', domain: 'tv' },
  { token: 'series', domain: 'tv' },
  { token: 'shows', domain: 'tv' },
  { token: 'show', domain: 'tv' },
];

// Weighted verb/keyword hits
// 'watch' is screen-generic — adds to BOTH film and tv
const KEYWORDS = [
  // game verbs (x2)
  { token: 'play', domain: 'game', weight: 2 },
  { token: 'playing', domain: 'game', weight: 2 },
  // book verbs (x2)
  { token: 'read', domain: 'book', weight: 2 },
  { token: 'reading', domain: 'book', weight: 2 },
  // recipe verbs (x2)
  { token: 'cook', domain: 'recipe', weight: 2 },
  { token: 'eat', domain: 'recipe', weight: 1 },
  // screen-generic verb (x2, counts for both film AND tv)
  { token: 'watch', domain: 'screen', weight: 2 },
];

/**
 * Classify query into a domain.
 * @param {string} query - user query
 * @param {string} selectedKind - current kind (all|film|tv|book|game|recipe)
 * @returns {{ domain: string, switched: boolean, from: string }}
 */
export function classifyDomain(query, selectedKind) {
  const q = (query || '').toLowerCase();
  const from = selectedKind || 'all';

  // Step 1: check for explicit domain nouns (longest-first already sorted above)
  for (const { token, domain } of EXPLICIT_NOUNS) {
    if (q.includes(token)) {
      // Found explicit noun → that domain wins
      // Exception: if selectedKind is 'all' and noun is a screen domain (film/tv),
      // don't override (spec: never pull from 'all' to film/tv via screen signals).
      if ((domain === 'film' || domain === 'tv') && from === 'all') {
        // Screen noun but selectedKind=all → fall through to keyword step
        break;
      }
      const switched = domain !== from;
      return { domain, switched, from };
    }
  }

  // Step 2: weighted keyword hits
  const hits = { book: 0, game: 0, recipe: 0, film: 0, tv: 0 };

  // Check explicit-noun keywords for domains not caught above (non-noun signals)
  // e.g., "read"/"cook"/"play" verbs
  for (const { token, domain, weight } of KEYWORDS) {
    // Simple word-boundary check: surround with spaces/start/end
    const re = new RegExp(`(?:^|\\s|\\b)${token}(?:\\b|\\s|$)`, 'i');
    if (re.test(q)) {
      if (domain === 'screen') {
        // Generic screen verb → add to both film and tv
        hits.film += weight;
        hits.tv += weight;
      } else {
        hits[domain] = (hits[domain] || 0) + weight;
      }
    }
  }

  // Also count explicit-noun tokens as weighted hits for the keyword step
  // (so "cook" appears in recipe, "read" in book, etc.)
  // Already handled via KEYWORDS above for verbs; nouns are in step 1.

  // Find max domain
  let maxDomain = from;
  let maxHits = 0;
  for (const [d, h] of Object.entries(hits)) {
    if (h > maxHits) {
      maxHits = h;
      maxDomain = d;
    } else if (h === maxHits && h > 0 && d === from) {
      // Prefer selectedKind on tie
      maxDomain = from;
    }
  }

  // Step 3: apply rule
  if (maxHits >= 2) {
    // Strong signal found
    // Exception: never pull from a new-domain into film/tv if selectedKind is a new-domain
    // (already handled — maxDomain would be film/tv only if screen verb dominate)
    // Exception: never override 'all' to film/tv via screen signals alone
    if ((maxDomain === 'film' || maxDomain === 'tv') && from === 'all') {
      return { domain: from, switched: false, from };
    }
    const switched = maxDomain !== from;
    return { domain: maxDomain, switched, from };
  }

  // No strong signal → stay
  return { domain: from, switched: false, from };
}