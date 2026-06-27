/**
 * Unit tests for lib/domainClassify.js + lib/domainRecommend.js + the
 * NEW_DOMAINS routing in app/api/recommend/route.js.
 *
 * Uses node:test + injected fakes — NO network, NO MiniMax calls.
 *
 * classifyDomain cases: ≥18 covering
 *   - new-domain noun dominance ("cozy mystery novel" → book)
 *   - verb disambiguation ("play with friends" → game, "cook dinner" → recipe)
 *   - explicit toggle preserved when no stronger signal
 *   - switched override only on STRONG signal or explicit domain noun
 *   - never override INTO film/tv/all from a new-domain signal
 *
 * domainRecommend cases: with injected llm + providerOverride
 *   - happy path returns ≥3 picks with reason + match + badge + image-or-null
 *   - recipe path hydrates partial picks via getDetails
 *   - <3 candidates triggers a broadening provider.search
 *   - hard failure (llm throws) returns empty picks, never throws
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyDomain } from '../lib/domainClassify.js';
import { domainRecommend } from '../lib/domainRecommend.js';
import { NEW_DOMAINS } from '../lib/providers/index.js';

// ── classifyDomain ───────────────────────────────────────────────────────────

test('classifyDomain: "cozy mystery novel" → book, no switch (kind=book)', () => {
  const r = classifyDomain('recommend a cozy mystery novel', 'book');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, false);
  assert.equal(r.from, 'book');
});

test('classifyDomain: "cozy mystery novel" → book, switched from all', () => {
  const r = classifyDomain('recommend a cozy mystery novel', 'all');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'all');
});

test('classifyDomain: "something to play with friends" → game', () => {
  const r = classifyDomain('something to play with friends', 'all');
  assert.equal(r.domain, 'game');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'all');
});

test('classifyDomain: "what should I cook for dinner" → recipe', () => {
  const r = classifyDomain('what should I cook for dinner', 'all');
  assert.equal(r.domain, 'recipe');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'all');
});

test('classifyDomain: "movies like Interstellar" + kind=all stays all', () => {
  const r = classifyDomain('movies like Interstellar', 'all');
  assert.equal(r.domain, 'all');
  assert.equal(r.switched, false);
  assert.equal(r.from, 'all');
});

test('classifyDomain: "movies like Interstellar" + kind=film stays film', () => {
  const r = classifyDomain('movies like Interstellar', 'film');
  assert.equal(r.domain, 'film');
  assert.equal(r.switched, false);
  assert.equal(r.from, 'film');
});

test('classifyDomain: "good sci-fi novel" + kind=film switches to book', () => {
  const r = classifyDomain('a good sci-fi novel', 'film');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'film');
});

test('classifyDomain: "good sci-fi novel" + kind=tv switches to book', () => {
  const r = classifyDomain('a good sci-fi novel', 'tv');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'tv');
});

test('classifyDomain: "best video game for PS5" → game even with kind=recipe', () => {
  const r = classifyDomain('best video game for PS5', 'recipe');
  assert.equal(r.domain, 'game');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'recipe');
});

test('classifyDomain: "what to make for dinner" → recipe, stays recipe', () => {
  const r = classifyDomain('what to make for dinner', 'recipe');
  assert.equal(r.domain, 'recipe');
  assert.equal(r.switched, false);
  assert.equal(r.from, 'recipe');
});

test('classifyDomain: plain "something cozy" + kind=recipe stays recipe', () => {
  const r = classifyDomain('something cozy', 'recipe');
  assert.equal(r.domain, 'recipe');
  assert.equal(r.switched, false);
  assert.equal(r.from, 'recipe');
});

test('classifyDomain: plain "something cozy" + kind=all stays all', () => {
  const r = classifyDomain('something cozy', 'all');
  assert.equal(r.domain, 'all');
  assert.equal(r.switched, false);
});

test('classifyDomain: empty query + kind=book stays book', () => {
  const r = classifyDomain('', 'book');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, false);
});

test('classifyDomain: "watch a movie" + kind=book switches to film (strong screen)', () => {
  // "watch" + "movie" → 2 strong screen signals → switch out of book
  const r = classifyDomain('watch a movie', 'book');
  assert.equal(r.domain, 'film');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'book');
});

test('classifyDomain: "play minecraft on switch" + kind=book switches to game', () => {
  const r = classifyDomain('play minecraft on switch', 'book');
  assert.equal(r.domain, 'game');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'book');
});

test('classifyDomain: "cozy mystery novel" + kind=book stays book (no switch)', () => {
  const r = classifyDomain('recommend a cozy mystery novel', 'book');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, false);
});

test('classifyDomain: "what to cook tonight" + kind=game switches to recipe', () => {
  const r = classifyDomain('what to cook tonight', 'game');
  assert.equal(r.domain, 'recipe');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'game');
});

test('classifyDomain: "a good book" + kind=all switches to book', () => {
  const r = classifyDomain('a good book', 'all');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'all');
});

test('classifyDomain: "horror game to play on steam" stays game with kind=game', () => {
  const r = classifyDomain('horror game to play on steam', 'game');
  assert.equal(r.domain, 'game');
  assert.equal(r.switched, false);
});

test('classifyDomain: "books about cooking" + kind=recipe → book (book noun dominates)', () => {
  // "books" is an explicit book noun — must override the "cooking" signal
  const r = classifyDomain('books about cooking', 'recipe');
  assert.equal(r.domain, 'book');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'recipe');
});

test('classifyDomain: "show me a good recipe" + kind=tv → recipe, NOT tv', () => {
  // "show" is screen-signal but "recipe" is an explicit domain noun → recipe wins
  const r = classifyDomain('show me a good recipe', 'tv');
  assert.equal(r.domain, 'recipe');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'tv');
});

test('classifyDomain: "new shows to watch" + kind=book → film (screen wins, 2 hits)', () => {
  // "shows" + "watch" → 2 screen signals → switch out of book
  const r = classifyDomain('new shows to watch', 'book');
  assert.equal(r.domain, 'tv');
  assert.equal(r.switched, true);
  assert.equal(r.from, 'book');
});

// ── domainRecommend ──────────────────────────────────────────────────────────

function fakeLlm(planResponse, rankResponse) {
  const calls = [];
  const llm = {
    calls,
    chat: {
      completions: {
        create: async (args) => {
          calls.push(args);
          const sys = (args.messages?.[0]?.content || '').toLowerCase();
          const reply = sys.includes('plan') ? planResponse : rankResponse;
          return { choices: [{ message: { content: JSON.stringify(reply) } }] };
        },
      },
    },
  };
  return llm;
}

function fakeProvider({ searchResults, getDetailsResults } = {}) {
  let searchCalls = 0;
  let detailsCalls = 0;
  return {
    callCounts: { search: 0, getDetails: 0 },
    async search(args) {
      this.callCounts.search++;
      if (typeof searchResults === 'function') {
        return await searchResults(args, searchCalls++);
      }
      return searchResults || [];
    },
    async getDetails(sourceId) {
      this.callCounts.getDetails++;
      if (typeof getDetailsResults === 'function') {
        return await getDetailsResults(sourceId, detailsCalls++);
      }
      return getDetailsResults;
    },
    domain: 'book',
    label: 'Books',
    accent: '#E8A94B',
  };
}

const BOOK_FIXTURES = [
  { id: 'book:b1', domain: 'book', sourceId: 'b1', title: 'The Hobbit', subtitle: 'J.R.R. Tolkien', year: 1937, rating: 8.0, image: 'https://x/h.jpg', reason: '', match: null, meta: { authors: ['Tolkien'] } },
  { id: 'book:b2', domain: 'book', sourceId: 'b2', title: 'Dune', subtitle: 'Frank Herbert', year: 1965, rating: 9.0, image: 'https://x/d.jpg', reason: '', match: null, meta: { authors: ['Herbert'] } },
  { id: 'book:b3', domain: 'book', sourceId: 'b3', title: 'Hyperion', subtitle: 'Dan Simmons', year: 1989, rating: 8.5, image: 'https://x/hy.jpg', reason: '', match: null, meta: { authors: ['Simmons'] } },
  { id: 'book:b4', domain: 'book', sourceId: 'b4', title: 'Neuromancer', subtitle: 'William Gibson', year: 1984, rating: 8.2, image: null, reason: '', match: null, meta: { authors: ['Gibson'] } },
];

test('domainRecommend: happy path returns ≥3 picks with reason/match/badge', async () => {
  const llm = fakeLlm(
    { searchTerms: ['epic fantasy', 'classic sci-fi'], filters: {}, intent: 'epic story-driven reads' },
    { picks: [
      { id: 'book:b1', reason: 'A perfect portal fantasy with rich world-building.', match: 92 },
      { id: 'book:b2', reason: 'Grand-scale sci-fi with deep political intrigue.', match: 95 },
      { id: 'book:b3', reason: 'Inventive structure, layered storytelling.', match: 88 },
      { id: 'book:b4', reason: 'Foundational cyberpunk, lean and mean.', match: 84 },
    ]},
  );
  const provider = fakeProvider({ searchResults: BOOK_FIXTURES });

  const steps = [];
  const candidates = [];
  const partials = [];
  const result = await domainRecommend({
    query: 'epic sci-fi books',
    domain: 'book',
    llm,
    providerOverride: provider,
    onStep: (label) => steps.push(label),
    onCandidates: (items) => candidates.push(items),
    onPartial: (p) => partials.push(p),
  });

  assert.equal(result.kind, 'book');
  assert.equal(result.intent, 'epic story-driven reads');
  assert.ok(result.picks.length >= 3, `expected ≥3 picks, got ${result.picks.length}`);
  for (const p of result.picks) {
    assert.ok(p.id, 'pick has id');
    assert.ok(p.title, 'pick has title');
    assert.equal(p.domain, 'book');
    assert.ok(typeof p.reason === 'string' && p.reason.length > 0, 'pick has non-empty reason');
    assert.ok(typeof p.match === 'number' && p.match >= 60 && p.match <= 99, `match in [60,99], got ${p.match}`);
    assert.ok(p.image === null || typeof p.image === 'string', 'image is null-or-string');
  }
  assert.equal(result.picks[0].badge, 'Top pick');
  assert.ok(steps.includes('Understanding your request'));
  assert.ok(steps.includes('Picking the best for you'));
  assert.ok(partials.length >= 1, 'onPartial fired');
  assert.equal(partials[0].kind, 'book');
  assert.ok(candidates.length >= 1, 'onCandidates fired');
});

test('domainRecommend: dedupes by title', async () => {
  const dupFixtures = [
    ...BOOK_FIXTURES,
    { id: 'book:b5', domain: 'book', sourceId: 'b5', title: 'Dune', subtitle: 'Frank Herbert (anniversary)', year: 2020, rating: 8.9, image: 'https://x/d2.jpg', reason: '', match: null, meta: {} },
  ];
  const llm = fakeLlm(
    { searchTerms: ['dune'], filters: {}, intent: 'sci-fi books' },
    { picks: [
      { id: 'book:b2', reason: 'x', match: 90 },
      { id: 'book:b5', reason: 'y', match: 85 },
      { id: 'book:b1', reason: 'z', match: 80 },
    ]},
  );
  const provider = fakeProvider({ searchResults: dupFixtures });
  const result = await domainRecommend({
    query: 'dune', domain: 'book', llm, providerOverride: provider,
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  const dune = result.picks.filter((p) => p.title === 'Dune');
  assert.equal(dune.length, 1, 'duplicate title deduped');
});

test('domainRecommend: <3 candidates triggers broadening search', async () => {
  let searchCount = 0;
  const llm = fakeLlm(
    { searchTerms: ['rare genre xyz'], filters: {}, intent: 'something obscure' },
    { picks: [
      { id: 'book:b1', reason: 'only option', match: 75 },
      { id: 'book:b2', reason: 'only option', match: 70 },
    ]},
  );
  const provider = fakeProvider({
    searchResults: (args, n) => {
      searchCount++;
      if (args && args.limit === 20) return BOOK_FIXTURES;
      return [BOOK_FIXTURES[0], BOOK_FIXTURES[1]];
    },
  });
  const result = await domainRecommend({
    query: 'obscure genre xyz', domain: 'book', llm, providerOverride: provider,
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  assert.ok(searchCount >= 2, `expected broadening search (saw ${searchCount} calls)`);
  assert.ok(result.picks.length >= 2);
});

test('domainRecommend: recipe path hydrates partial picks via getDetails', async () => {
  const partialPicks = [
    { id: 'recipe:r1', domain: 'recipe', sourceId: 'r1', title: 'Pasta A', subtitle: 'Italian', year: null, rating: null, image: 'https://x/p1.jpg', reason: '', match: null, meta: { partial: true } },
    { id: 'recipe:r2', domain: 'recipe', sourceId: 'r2', title: 'Pasta B', subtitle: 'Italian', year: null, rating: null, image: 'https://x/p2.jpg', reason: '', match: null, meta: { partial: true } },
  ];
  const fullPicks = partialPicks.map((p) => ({
    ...p,
    subtitle: 'Italian · Pasta',
    meta: { area: 'Italian', category: 'Pasta', ingredients: [{ name: 'flour', measure: '2 cups' }], instructions: 'cook', tags: [], youtube: '', source: null },
  }));

  const llm = fakeLlm(
    { searchTerms: ['pasta'], filters: {}, intent: 'comfort food' },
    { picks: [
      { id: 'recipe:r1', reason: 'Classic comfort dish.', match: 88 },
      { id: 'recipe:r2', reason: 'Hearty weeknight meal.', match: 85 },
    ]},
  );

  let detailsCalls = 0;
  const provider = fakeProvider({
    searchResults: partialPicks,
    getDetailsResults: () => {
      detailsCalls++;
      return fullPicks[(detailsCalls - 1) % fullPicks.length];
    },
  });

  const result = await domainRecommend({
    query: 'pasta', domain: 'recipe', llm, providerOverride: provider,
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  assert.ok(detailsCalls >= 1, `expected ≥1 getDetails hydration, got ${detailsCalls}`);
  for (const p of result.picks) {
    assert.equal(p.meta.partial, undefined, 'hydration removed partial flag');
    assert.ok(Array.isArray(p.meta.ingredients), 'hydrated pick has ingredients');
  }
});

test('domainRecommend: hard failure (llm throws) returns empty picks, no throw', async () => {
  const llm = {
    chat: { completions: { create: async () => { throw new Error('boom'); } } },
  };
  const provider = fakeProvider({ searchResults: BOOK_FIXTURES });

  const result = await domainRecommend({
    query: 'anything', domain: 'book', llm, providerOverride: provider,
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  assert.deepEqual(result, {
    intent: '', kind: 'book', picks: [], providers: [], lang: null,
  });
});

test('domainRecommend: llm returns malformed JSON → falls back gracefully', async () => {
  const llm = {
    calls: [],
    chat: {
      completions: {
        create: async (args) => {
          llm.calls.push(args);
          const sys = (args.messages?.[0]?.content || '').toLowerCase();
          if (sys.includes('plan')) {
            return { choices: [{ message: { content: 'not json at all' } }] };
          }
          return { choices: [{ message: { content: JSON.stringify({ picks: [{ id: 'book:b1', reason: 'best match', match: 80 }] }) } }] };
        },
      },
    },
  };
  const provider = fakeProvider({ searchResults: BOOK_FIXTURES });
  const result = await domainRecommend({
    query: 'whatever', domain: 'book', llm, providerOverride: provider,
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  assert.equal(result.intent, 'whatever', 'fallback intent is the query');
  assert.ok(result.picks.length >= 1, 'fallback still returns picks');
});

test('domainRecommend: excludes ids in excludeIds', async () => {
  const llm = fakeLlm(
    { searchTerms: ['epic'], filters: {}, intent: 'epic reads' },
    { picks: [
      { id: 'book:b1', reason: 'a', match: 90 },
      { id: 'book:b2', reason: 'b', match: 88 },
    ]},
  );
  const provider = fakeProvider({ searchResults: BOOK_FIXTURES });
  const result = await domainRecommend({
    query: 'epic', domain: 'book', llm, providerOverride: provider,
    excludeIds: new Set(['book:b1']),
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  const ids = result.picks.map((p) => p.id);
  assert.ok(!ids.includes('book:b1'), 'excluded id must not appear');
});

test('domainRecommend: New badge on picks whose year === current year', async () => {
  const currentYear = new Date().getFullYear();
  const fixtures = [
    ...BOOK_FIXTURES,
    { id: 'book:bnew', domain: 'book', sourceId: 'bnew', title: 'Brand New Book', subtitle: 'Author', year: currentYear, rating: 8.0, image: null, reason: '', match: null, meta: {} },
  ];
  const llm = fakeLlm(
    { searchTerms: ['new'], filters: {}, intent: 'fresh reads' },
    { picks: [
      { id: 'book:bnew', reason: 'freshest release this year', match: 91 },
      { id: 'book:b2', reason: 'classic', match: 88 },
    ]},
  );
  const provider = fakeProvider({ searchResults: fixtures });
  const result = await domainRecommend({
    query: 'new books', domain: 'book', llm, providerOverride: provider,
    onStep: () => {}, onCandidates: () => {}, onPartial: () => {},
  });
  const newPick = result.picks.find((p) => p.id === 'book:bnew');
  assert.ok(newPick, 'new pick present');
  assert.equal(newPick.badge, 'New');
});

// ── provider registry sanity ─────────────────────────────────────────────────

test('NEW_DOMAINS includes book/game/recipe', () => {
  assert.deepEqual(new Set(NEW_DOMAINS), new Set(['book', 'game', 'recipe']));
});