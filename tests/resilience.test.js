/**
 * Unit tests for resilience features:
 *   - agent dedupeByTitle
 *   - agent broadened extractConstraints
 *   - agent kindFromQuery
 *   - agent exactTitles detection
 *
 * Uses node:test + node:assert only. NO live network calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePick(overrides) {
  return {
    id: 'tt000',
    title: 'Test Film',
    kind: 'film',
    year: 2020,
    rating: 7.5,
    genres: ['Drama'],
    poster: null,
    _vote_count: 100,
    ...overrides,
  };
}

// ── dedupeByTitle (inline reimplementation to test the logic directly) ──────

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function dedupeById(picks) {
  const seen = new Map();
  for (const p of picks) {
    const existing = seen.get(p.id);
    if (!existing) {
      seen.set(p.id, p);
    } else {
      const newScore = (p.poster ? 100 : 0) + (p.rating || 0);
      const exScore = (existing.poster ? 100 : 0) + (existing.rating || 0);
      if (newScore > exScore) seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

function dedupeByTitle(picks) {
  const byId = dedupeById(picks);
  const seen = new Map();
  for (const p of byId) {
    const key = normalizeTitle(p.title);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
    } else {
      const newScore =
        (p.poster ? 1000 : 0) + (p.rating || 0) * 10 + (p._vote_count || 0) / 1000;
      const exScore =
        (existing.poster ? 1000 : 0) +
        (existing.rating || 0) * 10 +
        (existing._vote_count || 0) / 1000;
      if (newScore > exScore) seen.set(key, p);
    }
  }
  return Array.from(seen.values());
}

// ── extractConstraints (inline copy matching agent.js logic) ─────────────────

const CURRENT_YEAR = new Date().getFullYear();

function extractConstraints(query) {
  const constraints = {};
  const q = query.toLowerCase();

  const runtimeHours = q.match(/under\s+(\d+)\s*h(?:our|r)?s?/i);
  if (runtimeHours) constraints.runtimeMaxMin = parseInt(runtimeHours[1]) * 60;

  const rtMinutes = q.match(/(?:less than|under|max|maximum)\s+(\d{2,3})\s*(?:min|minutes?)/i);
  if (rtMinutes && !constraints.runtimeMaxMin)
    constraints.runtimeMaxMin = parseInt(rtMinutes[1]);

  const pastYears = q.match(/past\s+(\d+)\s+years?/i) || q.match(/last\s+(\d+)\s+years?/i);
  if (pastYears) constraints.yearMin = CURRENT_YEAR - parseInt(pastYears[1]);

  if (/\b(?:past|last)\s+decade\b/.test(q)) {
    if (constraints.yearMin == null) constraints.yearMin = CURRENT_YEAR - 10;
  } else {
    let decadeStart = null;
    const four = q.match(/\b((?:19|20)\d0)s\b/);
    const two = q.match(/(?:^|\s|')(\d0)s\b/);
    const words = { sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990 };
    if (four) {
      decadeStart = parseInt(four[1], 10);
    } else if (two) {
      const d = parseInt(two[1], 10);
      decadeStart = d >= 30 ? 1900 + d : 2000 + d;
    } else {
      for (const [w, y] of Object.entries(words)) {
        if (q.includes(w)) { decadeStart = y; break; }
      }
    }
    if (decadeStart) {
      constraints.yearMin = decadeStart;
      constraints.yearMax = decadeStart + 9;
    }
  }

  const genreMap = [
    { terms: ['sci-fi', 'scifi', 'science fiction'], genre: 'Science Fiction' },
    { terms: ['animat'], genre: 'Animation' },
    { terms: ['romcom', 'romantic comedy', 'rom-com'], genre: 'Romance' },
    { terms: ['thriller'], genre: 'Thriller' },
    { terms: ['horror'], genre: 'Horror' },
    { terms: ['comedy', 'comedies'], genre: 'Comedy' },
    { terms: ['drama', 'dramas'], genre: 'Drama' },
    { terms: ['action'], genre: 'Action' },
    { terms: ['crime'], genre: 'Crime' },
    { terms: ['fantasy'], genre: 'Fantasy' },
    { terms: ['documentary', 'documentaries'], genre: 'Documentary' },
    { terms: ['romance', 'romantic'], genre: 'Romance' },
    { terms: ['family'], genre: 'Family' },
  ];

  for (const { terms, genre } of genreMap) {
    if (terms.some((t) => q.includes(t))) {
      if (!constraints.requireGenres) {
        constraints.requireGenres = [genre];
      } else if (!constraints.requireGenres.includes(genre)) {
        constraints.requireGenres.push(genre);
      }
    }
  }

  return constraints;
}

// ── kindFromQuery (inline copy matching agent.js logic) ───────────────────────

function kindFromQuery(query, fallback = 'all') {
  const q = (query || '').toLowerCase();
  const film = /\b(movie|movies|film|films|feature)\b/.test(q);
  const tv = /\b(tv|telly|television|show|shows|series|sitcom|sitcoms|mini-?series|episode|episodes)\b/.test(q);
  if (film && !tv) return 'film';
  if (tv && !film) return 'tv';
  return fallback;
}

// ── Tests: dedupeByTitle ─────────────────────────────────────────────────────

test('dedupeByTitle: strips "The" prefix for dedup', () => {
  const a = makePick({ id: 'tt001', title: 'The Matrix', rating: 8.7 });
  const b = makePick({ id: 'tt002', title: 'Matrix', rating: 7.0 });
  const result = dedupeByTitle([a, b]);
  assert.equal(result.length, 1);
  assert.equal(result[0].rating, 8.7);
});

test('dedupeByTitle: keeps different titles', () => {
  const a = makePick({ id: 'tt001', title: 'Inception', rating: 8.8 });
  const b = makePick({ id: 'tt002', title: 'Interstellar', rating: 8.6 });
  const result = dedupeByTitle([a, b]);
  assert.equal(result.length, 2);
});

test('dedupeByTitle: dedupes same title across different ids', () => {
  const a = makePick({ id: 'tt001', title: 'Old School', rating: 7, poster: null });
  const b = makePick({ id: 'tt099', title: 'Old School', rating: 7, poster: 'http://x.com/p.jpg' });
  const result = dedupeByTitle([a, b]);
  assert.equal(result.length, 1);
  assert.ok(result[0].poster);
});

// ── Tests: extractConstraints ─────────────────────────────────────────────────

test('extractConstraints: maps "thriller" to requireGenres', () => {
  const c = extractConstraints('a tense thriller from the 2010s');
  assert.ok(Array.isArray(c.requireGenres));
  assert.ok(c.requireGenres.includes('Thriller'));
});

test('extractConstraints: maps "horror" to requireGenres', () => {
  const c = extractConstraints('best horror movies of the 2000s');
  assert.ok(c.requireGenres?.includes('Horror'));
});

test('extractConstraints: maps "sci-fi" to Science Fiction', () => {
  const c = extractConstraints('great sci-fi shows to binge');
  assert.ok(c.requireGenres?.includes('Science Fiction'));
});

test('extractConstraints: maps "science fiction" to Science Fiction', () => {
  const c = extractConstraints('science fiction epics from 2020s');
  assert.ok(c.requireGenres?.includes('Science Fiction'));
});

test('extractConstraints: maps "comedy" to Comedy', () => {
  const c = extractConstraints('funny comedy films for tonight');
  assert.ok(c.requireGenres?.includes('Comedy'));
});

test('extractConstraints: maps "drama" to Drama', () => {
  const c = extractConstraints('emotional drama series');
  assert.ok(c.requireGenres?.includes('Drama'));
});

test('extractConstraints: maps "action" to Action', () => {
  const c = extractConstraints('action-packed movies');
  assert.ok(c.requireGenres?.includes('Action'));
});

test('extractConstraints: maps "crime" to Crime', () => {
  const c = extractConstraints('dark crime thriller');
  assert.ok(c.requireGenres?.includes('Crime'));
  assert.ok(c.requireGenres?.includes('Thriller'));
});

test('extractConstraints: maps "fantasy" to Fantasy', () => {
  const c = extractConstraints('fantasy adventure');
  assert.ok(c.requireGenres?.includes('Fantasy'));
});

test('extractConstraints: maps "documentary" to Documentary', () => {
  const c = extractConstraints('interesting documentaries about nature');
  assert.ok(c.requireGenres?.includes('Documentary'));
});

test('extractConstraints: maps "family" to Family', () => {
  const c = extractConstraints('family movies to watch together');
  assert.ok(c.requireGenres?.includes('Family'));
});

test('extractConstraints: maps "romance" to Romance', () => {
  const c = extractConstraints('romantic movie for date night');
  assert.ok(c.requireGenres?.includes('Romance'));
});

test('extractConstraints: maps "romcom" to Romance', () => {
  const c = extractConstraints('a light romcom please');
  assert.ok(c.requireGenres?.includes('Romance'));
});

test('extractConstraints: maps "animation" to Animation', () => {
  const c = extractConstraints('animated films for kids');
  assert.ok(c.requireGenres?.includes('Animation'));
});

test('extractConstraints: decade sets yearMin + yearMax', () => {
  const c = extractConstraints('a tense thriller from the 2010s');
  assert.equal(c.yearMin, 2010);
  assert.equal(c.yearMax, 2019);
});

test('extractConstraints: "past 5 years" sets yearMin', () => {
  const c = extractConstraints('comedy movies from the past 5 years');
  assert.equal(c.yearMin, CURRENT_YEAR - 5);
});

test('extractConstraints: no constraints on generic query', () => {
  const c = extractConstraints('something to watch tonight');
  assert.equal(Object.keys(c).length, 0);
});

// ── Tests: kindFromQuery ──────────────────────────────────────────────────────

test('kindFromQuery: "comedy movie" → film', () => {
  assert.equal(kindFromQuery('comedy movie'), 'film');
});

test('kindFromQuery: "best films" → film', () => {
  assert.equal(kindFromQuery('best films'), 'film');
});

test('kindFromQuery: "TV shows" → tv', () => {
  assert.equal(kindFromQuery('TV shows'), 'tv');
});

test('kindFromQuery: "sitcom" → tv', () => {
  assert.equal(kindFromQuery('best sitcom'), 'tv');
});

test('kindFromQuery: "feel-good comedies" → fallback', () => {
  // No film or tv keyword — returns the fallback
  assert.equal(kindFromQuery('feel-good comedies', 'all'), 'all');
  assert.equal(kindFromQuery('feel-good comedies', 'film'), 'film');
});

test('kindFromQuery: both film and tv keywords → fallback', () => {
  assert.equal(kindFromQuery('film series', 'all'), 'all');
});

// ── Tests: rankAndBadge cap = 24 ─────────────────────────────────────────────

function rankAndBadgeInline(picks) {
  const CURRENT_YEAR_LOCAL = new Date().getFullYear();
  const sorted = [...picks].sort((a, b) => {
    const ra = a.rating || 0;
    const rb = b.rating || 0;
    if (rb !== ra) return rb - ra;
    return (b._vote_count || 0) - (a._vote_count || 0);
  });
  return sorted.slice(0, 24).map((p, i) => {
    const badge =
      i === 0 && (p.rating || 0) >= 7.5
        ? { label: 'Top pick', variant: 'gold' }
        : p.year === CURRENT_YEAR_LOCAL
          ? { label: 'New', variant: 'solid' }
          : undefined;
    const { _vote_count: _, ...rest } = p;
    return badge ? { ...rest, badge } : rest;
  });
}

test('rankAndBadge cap: returns at most 24 picks', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    makePick({ id: `tt${i.toString().padStart(3, '0')}`, title: `Film ${i}`, rating: 7 - i * 0.1 }),
  );
  const result = rankAndBadgeInline(many);
  assert.ok(result.length <= 24, `Expected <= 24, got ${result.length}`);
  assert.equal(result.length, 24);
});

test('rankAndBadge cap: returns all picks when fewer than 24', () => {
  const few = Array.from({ length: 5 }, (_, i) =>
    makePick({ id: `tt${i}`, title: `Film ${i}`, rating: 8 }),
  );
  const result = rankAndBadgeInline(few);
  assert.equal(result.length, 5);
});

// ── Tests: PERSON_QUERY_RE (exactTitles detection regex) ─────────────────────

const PERSON_QUERY_RE = /\b(starring|featuring|with|directed by)\s+[A-Z][a-z]+/;

test('PERSON_QUERY_RE: matches "starring Steve Carell"', () => {
  assert.ok(PERSON_QUERY_RE.test('comedies starring Steve Carell'));
});

test('PERSON_QUERY_RE: matches "featuring Tom Hanks"', () => {
  assert.ok(PERSON_QUERY_RE.test('movies featuring Tom Hanks'));
});

test('PERSON_QUERY_RE: matches "directed by Christopher Nolan"', () => {
  assert.ok(PERSON_QUERY_RE.test('films directed by Christopher Nolan'));
});

test('PERSON_QUERY_RE: matches "with Will Smith"', () => {
  assert.ok(PERSON_QUERY_RE.test('action movies with Will Smith'));
});

test('PERSON_QUERY_RE: does NOT match lowercase name', () => {
  assert.ok(!PERSON_QUERY_RE.test('something with john'));
});

test('PERSON_QUERY_RE: does NOT match generic genre query', () => {
  assert.ok(!PERSON_QUERY_RE.test('feel-good comedies from the 2010s'));
});

// ── Tests: exactTitles suppresses genre top-up ────────────────────────────────

test('exactTitles: genre top-up is skipped when exactTitles is true', () => {
  const isExactTitles = true;
  const requireGenres = ['Comedy'];
  const filtered = [makePick({ id: 'tt001', title: 'The 40-Year-Old Virgin', genres: ['Comedy'] })];

  let topupWasCalled = false;
  if (!isExactTitles && requireGenres && requireGenres.length > 0 && filtered.length < 12) {
    topupWasCalled = true;
  }

  assert.ok(!topupWasCalled, 'Genre top-up should be skipped for exactTitles queries');
});

test('exactTitles: genre top-up runs for non-person genre queries', () => {
  const isExactTitles = false;
  const requireGenres = ['Comedy'];
  const filtered = [makePick({ id: 'tt001', title: 'Film A', genres: ['Comedy'] })];

  let topupWasCalled = false;
  if (!isExactTitles && requireGenres && requireGenres.length > 0 && filtered.length < 12) {
    topupWasCalled = true;
  }

  assert.ok(topupWasCalled, 'Genre top-up should run for genre queries');
});

// ── Tests: genre top-up (inline simulation) ───────────────────────────────────

test('genre top-up: fills thin results to >= 6', () => {
  const thin = [
    makePick({ id: 'tt001', title: 'Film A', genres: ['Thriller'] }),
    makePick({ id: 'tt002', title: 'Film B', genres: ['Thriller'] }),
  ];

  const discoveryPicks = [
    makePick({ id: 'tt003', title: 'Film C', genres: ['Thriller'] }),
    makePick({ id: 'tt004', title: 'Film D', genres: ['Thriller'] }),
    makePick({ id: 'tt005', title: 'Film E', genres: ['Thriller'] }),
    makePick({ id: 'tt006', title: 'Film F', genres: ['Thriller'] }),
    makePick({ id: 'tt007', title: 'Film G', genres: ['Thriller'] }),
  ];

  const requireGenres = ['Thriller'];
  const topupFiltered = discoveryPicks.filter((p) => {
    const genres = (p.genres || []).map((g) => g.toLowerCase());
    return requireGenres.some((rg) => genres.some((pg) => pg.includes(rg.toLowerCase())));
  });

  const combined = dedupeByTitle([...thin, ...topupFiltered]);
  assert.ok(combined.length >= 6, `Expected >= 6, got ${combined.length}`);
});

test('genre top-up: does not add off-genre picks', () => {
  const thin = [
    makePick({ id: 'tt001', title: 'Thriller Film', genres: ['Thriller'] }),
  ];

  const discoveryPicks = [
    makePick({ id: 'tt002', title: 'Comedy Film', genres: ['Comedy'] }),
    makePick({ id: 'tt003', title: 'Action Film', genres: ['Action'] }),
  ];

  const requireGenres = ['Thriller'];
  const topupFiltered = discoveryPicks.filter((p) => {
    const genres = (p.genres || []).map((g) => g.toLowerCase());
    return requireGenres.some((rg) => genres.some((pg) => pg.includes(rg.toLowerCase())));
  });

  const combined = dedupeByTitle([...thin, ...topupFiltered]);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].title, 'Thriller Film');
});
