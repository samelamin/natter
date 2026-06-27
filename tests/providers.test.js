/**
 * Unit tests for lib/providers/{books,games,recipes,index}.js
 * Uses node:test + mock fetch — does NOT hit the live APIs.
 *
 * Coverage:
 *   - normalizeToPick: exact unified shape, ratings normalised 0-10, ids
 *     `book:|game:|recipe:`, subtitles, ingredients pairs.
 *   - search: URL shape, params for filters, NO_KEY error path for games.
 *   - getDetails: full pick including description (game) / ingredients (recipe).
 *   - provider registry: getProvider, DOMAIN_META has all 5 domains.
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as books from '../lib/providers/books.js';
import * as games from '../lib/providers/games.js';
import * as recipes from '../lib/providers/recipes.js';
import {
  PROVIDERS,
  NEW_DOMAINS,
  getProvider,
  DOMAIN_META,
} from '../lib/providers/index.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const BOOK_VOLUME = {
  id: 'zyTCAlFPjgYC',
  volumeInfo: {
    title: 'The Pragmatic Programmer',
    subtitle: 'Your journey to mastery',
    authors: ['David Thomas', 'Andrew Hunt'],
    publishedDate: '2019-09-13',
    description: 'A great book about programming.',
    pageCount: 352,
    categories: ['Computers', 'Programming'],
    averageRating: 4.5,
    imageLinks: {
      thumbnail: 'http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1',
    },
    publisher: 'Addison-Wesley',
    language: 'en',
    previewLink: 'http://books.google.com/books?id=zyTCAlFPjgYC',
  },
};

const BOOK_VOLUME_LIST = {
  totalItems: 1,
  items: [BOOK_VOLUME],
};

const GAME_RESULT = {
  id: 3498,
  name: 'Hollow Knight',
  released: '2017-02-24',
  rating: 4.4,
  metacritic: 87,
  background_image: 'https://media.rawg.io/media/games/4cf/4cf0c3a6f4cf0c3a6f4c.jpg',
  genres: [{ name: 'Action' }, { name: 'Indie' }, { name: 'Metroidvania' }],
  platforms: [
    { platform: { name: 'PC' } },
    { platform: { name: 'macOS' } },
    { platform: { name: 'Linux' } },
  ],
  short_screenshots: [
    { image: 'https://media.rawg.io/media/screenshots/4cf/ss1.jpg' },
    { image: 'https://media.rawg.io/media/screenshots/4cf/ss2.jpg' },
  ],
};

const GAME_DETAIL = {
  ...GAME_RESULT,
  description_raw: 'Hollow Knight is a Metroidvania action game.',
};

const GAME_LIST = {
  count: 1,
  results: [GAME_RESULT],
};

const MEAL_FULL = {
  idMeal: '52772',
  strMeal: 'Teriyaki Chicken Casserole',
  strCategory: 'Chicken',
  strArea: 'Japanese',
  strInstructions: 'Preheat oven to 350 F.',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/wxywrq1468235067.jpg',
  strYoutube: 'https://www.youtube.com/watch?v=4aZr5MGZXNM',
  strSource: 'https://www.bbcgoodfood.com/recipes/teriyaki',
  strTags: 'Meat,Casserole',
  strIngredient1: 'soy sauce',
  strIngredient2: 'water',
  strIngredient3: '',
  strIngredient4: null,
  strIngredient5: 'chicken',
  strIngredient6: '   ',
  strMeasure1: '3/4 cup',
  strMeasure2: '1/2 cup',
  strMeasure3: '',
  strMeasure4: null,
  strMeasure5: '1 lb',
  strMeasure6: '   ',
};

const MEAL_LIST_FULL = { meals: [MEAL_FULL] };

const MEAL_PARTIAL = {
  idMeal: '52772',
  strMeal: 'Teriyaki Chicken Casserole',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/wxywrq1468235067.jpg',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
const savedKey = process.env.RAWG_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (savedKey === undefined) delete process.env.RAWG_API_KEY;
  else process.env.RAWG_API_KEY = savedKey;
});

function mockJsonResponse(urlMatch, body, { status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return calls;
}

function pickKeys(pick) {
  // The union of fields any provider may emit, so we can assert the exact
  // shape per-provider without coupling to optional fields.
  return {
    id: pick.id,
    domain: pick.domain,
    sourceId: pick.sourceId,
    title: pick.title,
    subtitle: pick.subtitle,
    year: pick.year,
    rating: pick.rating,
    image: pick.image,
    reason: pick.reason,
    match: pick.match,
    metaKeys: Object.keys(pick.meta).sort(),
  };
}

// ── Provider registry ───────────────────────────────────────────────────────

test('registry: getProvider(book|game|recipe) returns the module', () => {
  assert.equal(getProvider('book'), books);
  assert.equal(getProvider('game'), games);
  assert.equal(getProvider('recipe'), recipes);
});

test('registry: getProvider(unknown) returns null', () => {
  assert.equal(getProvider('nope'), null);
  assert.equal(getProvider(''), null);
});

test('registry: PROVIDERS contains book, game, recipe', () => {
  assert.equal(PROVIDERS.book, books);
  assert.equal(PROVIDERS.game, games);
  assert.equal(PROVIDERS.recipe, recipes);
});

test('registry: NEW_DOMAINS is exactly [book, game, recipe]', () => {
  assert.deepEqual([...NEW_DOMAINS].sort(), ['book', 'game', 'recipe']);
});

test('registry: DOMAIN_META has all 5 domains (film, tv, book, game, recipe)', () => {
  for (const d of ['film', 'tv', 'book', 'game', 'recipe']) {
    assert.ok(DOMAIN_META[d], `DOMAIN_META.${d} must exist`);
    assert.equal(typeof DOMAIN_META[d].label, 'string');
    assert.equal(typeof DOMAIN_META[d].accent, 'string');
    assert.equal(typeof DOMAIN_META[d].verb, 'string');
  }
});

test('registry: DOMAIN_META book accent matches the spec', () => {
  assert.equal(DOMAIN_META.book.accent, '#E8A94B');
  assert.equal(DOMAIN_META.game.accent, '#5BC8AF');
  assert.equal(DOMAIN_META.recipe.accent, '#F2766B');
});

test('provider: books module exports domain/label/accent metadata', () => {
  assert.equal(books.domain, 'book');
  assert.equal(books.label, 'Books');
  assert.equal(books.accent, '#E8A94B');
  assert.equal(typeof books.search, 'function');
  assert.equal(typeof books.getDetails, 'function');
  assert.equal(typeof books.normalizeToPick, 'function');
});

test('provider: games module exports domain/label/accent metadata', () => {
  assert.equal(games.domain, 'game');
  assert.equal(games.label, 'Games');
  assert.equal(games.accent, '#5BC8AF');
});

test('provider: recipes module exports domain/label/accent metadata', () => {
  assert.equal(recipes.domain, 'recipe');
  assert.equal(recipes.label, 'Recipes');
  assert.equal(recipes.accent, '#F2766B');
});

// ── books.normalizeToPick ───────────────────────────────────────────────────

test('books.normalizeToPick: returns unified pick shape', () => {
  const pick = books.normalizeToPick(BOOK_VOLUME);
  assert.deepEqual(pickKeys(pick), {
    id: 'book:zyTCAlFPjgYC',
    domain: 'book',
    sourceId: 'zyTCAlFPjgYC',
    title: 'The Pragmatic Programmer',
    subtitle: 'David Thomas, Andrew Hunt',
    year: 2019,
    rating: 9,
    image: 'https://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1',
    reason: '',
    match: null,
    metaKeys: [
      'authors',
      'categories',
      'description',
      'language',
      'pageCount',
      'previewLink',
      'publisher',
    ],
  });
});

test('books.normalizeToPick: normalises 0-5 averageRating to 0-10 scale', () => {
  const a = books.normalizeToPick({
    id: 'A',
    volumeInfo: { title: 'A', averageRating: 3.25 },
  });
  assert.equal(a.rating, 6.5);
});

test('books.normalizeToPick: rating is null when averageRating missing', () => {
  const p = books.normalizeToPick({ id: 'X', volumeInfo: { title: 'X' } });
  assert.equal(p.rating, null);
});

test('books.normalizeToPick: forces image thumbnail to https', () => {
  const p = books.normalizeToPick({
    id: 'X',
    volumeInfo: {
      title: 'X',
      imageLinks: { thumbnail: 'http://example.com/cover.jpg' },
    },
  });
  assert.equal(p.image, 'https://example.com/cover.jpg');
});

test('books.normalizeToPick: image is null when no imageLinks', () => {
  const p = books.normalizeToPick({ id: 'X', volumeInfo: { title: 'X' } });
  assert.equal(p.image, null);
});

test('books.normalizeToPick: parses year from YYYY only date', () => {
  const p = books.normalizeToPick({
    id: 'X',
    volumeInfo: { title: 'X', publishedDate: '2003' },
  });
  assert.equal(p.year, 2003);
});

test('books.normalizeToPick: year is null when publishedDate missing', () => {
  const p = books.normalizeToPick({ id: 'X', volumeInfo: { title: 'X' } });
  assert.equal(p.year, null);
});

// ── books.search ────────────────────────────────────────────────────────────

test('books.search: hits the volumes endpoint and maps items to picks', async () => {
  const calls = mockJsonResponse(/volumes/, BOOK_VOLUME_LIST);
  const out = await books.search({ query: 'pragmatic programmer', limit: 10 });
  assert.equal(calls.length, 1);
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/books/v1/volumes');
  assert.equal(u.searchParams.get('q'), 'pragmatic programmer');
  assert.equal(u.searchParams.get('maxResults'), '10');
  assert.equal(u.searchParams.get('printType'), 'books');
  assert.equal(u.searchParams.get('orderBy'), 'relevance');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'book:zyTCAlFPjgYC');
  assert.equal(out[0].domain, 'book');
});

test('books.search: prepends subject: when filters.subject is set', async () => {
  const calls = mockJsonResponse(/volumes/, BOOK_VOLUME_LIST);
  await books.search({ query: 'kittens', filters: { subject: 'Juvenile' } });
  const u = new URL(calls[0].url);
  const q = u.searchParams.get('q') || '';
  assert.ok(q.includes('subject:Juvenile'), `expected subject: prefix in q=${q}`);
  assert.ok(q.includes('kittens'));
});

test('books.search: works keyless (does NOT append key= when GOOGLE_BOOKS_API_KEY unset)', async () => {
  delete process.env.GOOGLE_BOOKS_API_KEY;
  const calls = mockJsonResponse(/volumes/, BOOK_VOLUME_LIST);
  await books.search({ query: 'foo' });
  assert.equal(calls[0].url.includes('key='), false, 'must not include key= when env unset');
});

test('books.search: appends key= when GOOGLE_BOOKS_API_KEY set', async () => {
  process.env.GOOGLE_BOOKS_API_KEY = 'TEST_KEY_123';
  const calls = mockJsonResponse(/volumes/, BOOK_VOLUME_LIST);
  await books.search({ query: 'foo' });
  assert.ok(calls[0].url.includes('key=TEST_KEY_123'));
});

test('books.getDetails: returns a normalized pick for the volumeId', async () => {
  mockJsonResponse(/zyTCAlFPjgYC$/, BOOK_VOLUME);
  const p = await books.getDetails('zyTCAlFPjgYC');
  assert.equal(p.id, 'book:zyTCAlFPjgYC');
  assert.equal(p.title, 'The Pragmatic Programmer');
  assert.equal(p.meta.pageCount, 352);
});

test('books.search: throws on non-ok upstream', async () => {
  mockJsonResponse(/volumes/, {}, { status: 500 });
  await assert.rejects(books.search({ query: 'foo' }), /books 500/);
});

// ── games.normalizeToPick ───────────────────────────────────────────────────

test('games.normalizeToPick: returns unified pick shape', () => {
  const pick = games.normalizeToPick(GAME_RESULT);
  assert.deepEqual(pickKeys(pick), {
    id: 'game:3498',
    domain: 'game',
    sourceId: '3498',
    title: 'Hollow Knight',
    subtitle: 'Action, Indie',
    year: 2017,
    rating: 8.7,
    image: 'https://media.rawg.io/media/games/4cf/4cf0c3a6f4cf0c3a6f4c.jpg',
    reason: '',
    match: null,
    metaKeys: ['description', 'genres', 'metacritic', 'platforms', 'released', 'screenshots'],
  });
});

test('games.normalizeToPick: prefers metacritic/10 over rating*2 when metacritic present', () => {
  // rating=4.4 → 8.8, but metacritic 87/10 = 8.7 wins.
  const p = games.normalizeToPick({
    id: 1, name: 'X', released: '2020-01-01', rating: 4.4, metacritic: 87,
  });
  assert.equal(p.rating, 8.7);
});

test('games.normalizeToPick: falls back to rating*2 when metacritic missing', () => {
  const p = games.normalizeToPick({
    id: 1, name: 'X', released: '2020-01-01', rating: 4.25, metacritic: null,
  });
  assert.equal(p.rating, 8.5);
});

test('games.normalizeToPick: rating is null when both rating and metacritic missing', () => {
  const p = games.normalizeToPick({
    id: 1, name: 'X', released: '2020-01-01', rating: null, metacritic: null,
  });
  assert.equal(p.rating, null);
});

test('games.normalizeToPick: platforms and screenshots mapped to plain arrays', () => {
  const p = games.normalizeToPick(GAME_RESULT);
  assert.deepEqual(p.meta.platforms, ['PC', 'macOS', 'Linux']);
  assert.deepEqual(p.meta.screenshots, [
    'https://media.rawg.io/media/screenshots/4cf/ss1.jpg',
    'https://media.rawg.io/media/screenshots/4cf/ss2.jpg',
  ]);
});

test('games.normalizeToPick: subtitle is top 2 genre names joined by comma', () => {
  const p = games.normalizeToPick(GAME_RESULT);
  assert.equal(p.subtitle, 'Action, Indie');
});

test('games.normalizeToPick: keeps description_raw in meta.description when present', () => {
  const p = games.normalizeToPick(GAME_DETAIL);
  assert.equal(p.meta.description, 'Hollow Knight is a Metroidvania action game.');
});

// ── games.search ────────────────────────────────────────────────────────────

test('games.search: throws code NO_KEY when RAWG_API_KEY missing', async () => {
  delete process.env.RAWG_API_KEY;
  await assert.rejects(
    () => games.search({ query: 'foo' }),
    (err) => err.code === 'NO_KEY' && /RAWG_API_KEY/.test(err.message),
  );
});

test('games.search: hits /games with key + search + page_size + ordering', async () => {
  process.env.RAWG_API_KEY = 'K';
  const calls = mockJsonResponse(/api\.rawg\.io\/api\/games/, GAME_LIST);
  const out = await games.search({ query: 'hollow knight', limit: 5 });
  assert.equal(calls.length, 1);
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('key'), 'K');
  assert.equal(u.searchParams.get('search'), 'hollow knight');
  assert.equal(u.searchParams.get('page_size'), '5');
  assert.equal(u.searchParams.get('ordering'), '-rating');
  assert.equal(u.searchParams.get('search_precise'), 'true');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'game:3498');
});

test('games.search: passes filters.genres, filters.ordering, filters.dates', async () => {
  process.env.RAWG_API_KEY = 'K';
  const calls = mockJsonResponse(/api\.rawg\.io\/api\/games/, GAME_LIST);
  await games.search({
    query: 'foo',
    filters: { genres: 'action,indie', ordering: 'released', dates: '2017-01-01,2017-12-31' },
  });
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('genres'), 'action,indie');
  assert.equal(u.searchParams.get('ordering'), 'released');
  assert.equal(u.searchParams.get('dates'), '2017-01-01,2017-12-31');
});

test('games.getDetails: merges description_raw into meta.description', async () => {
  process.env.RAWG_API_KEY = 'K';
  mockJsonResponse(/api\.rawg\.io\/api\/games\/3498/, GAME_DETAIL);
  const p = await games.getDetails('3498');
  assert.equal(p.id, 'game:3498');
  assert.equal(p.meta.description, 'Hollow Knight is a Metroidvania action game.');
});

test('games.search: throws on non-ok upstream', async () => {
  process.env.RAWG_API_KEY = 'K';
  mockJsonResponse(/api\.rawg\.io\/api\/games/, {}, { status: 503 });
  await assert.rejects(games.search({ query: 'foo' }), /games 503/);
});

// ── recipes.normalizeToPick ─────────────────────────────────────────────────

test('recipes.normalizeToPick: returns unified pick shape with id recipe:...', () => {
  const pick = recipes.normalizeToPick(MEAL_FULL);
  assert.equal(pick.id, 'recipe:52772');
  assert.equal(pick.domain, 'recipe');
  assert.equal(pick.sourceId, '52772');
  assert.equal(pick.title, 'Teriyaki Chicken Casserole');
  assert.equal(pick.subtitle, 'Japanese · Chicken');
  assert.equal(pick.year, null);
  assert.equal(pick.rating, null);
  assert.equal(pick.reason, '');
  assert.equal(pick.match, null);
  assert.equal(pick.image, 'https://www.themealdb.com/images/media/meals/wxywrq1468235067.jpg');
  assert.deepEqual(pickKeys(pick).metaKeys, [
    'area', 'category', 'ingredients', 'instructions', 'source', 'tags', 'youtube',
  ]);
});

test('recipes.normalizeToPick: ingredients skips empty/null/whitespace slots', () => {
  const pick = recipes.normalizeToPick(MEAL_FULL);
  assert.deepEqual(pick.meta.ingredients, [
    { name: 'soy sauce', measure: '3/4 cup' },
    { name: 'water', measure: '1/2 cup' },
    { name: 'chicken', measure: '1 lb' },
  ]);
});

test('recipes.normalizeToPick: subtitle is area · category (or category only)', () => {
  assert.equal(
    recipes.normalizeToPick(MEAL_FULL).subtitle,
    'Japanese · Chicken',
  );
  assert.equal(
    recipes.normalizeToPick({ ...MEAL_FULL, strArea: '' }).subtitle,
    'Chicken',
  );
});

test('recipes.normalizeToPick: tags is split + trimmed, [] when missing', () => {
  assert.deepEqual(recipes.normalizeToPick(MEAL_FULL).meta.tags, ['Meat', 'Casserole']);
  assert.deepEqual(
    recipes.normalizeToPick({ ...MEAL_FULL, strTags: null }).meta.tags,
    [],
  );
});

test('recipes.normalizeToPick: youtube + source passed through (null when missing)', () => {
  const partial = { ...MEAL_FULL, strYoutube: '', strSource: null };
  const p = recipes.normalizeToPick(partial);
  assert.equal(p.meta.youtube, '');
  assert.equal(p.meta.source, null);
});

// ── recipes.search ──────────────────────────────────────────────────────────

test('recipes.search: free-text query hits /search.php?s=', async () => {
  const calls = mockJsonResponse(/search\.php\?s=/, MEAL_LIST_FULL);
  const out = await recipes.search({ query: 'chicken' });
  assert.equal(calls.length, 1);
  assert.ok(decodeURIComponent(calls[0].url).includes('s=chicken'));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'recipe:52772');
  // Full meal — no partial flag
  assert.equal(out[0].meta.partial, undefined);
});

test('recipes.search: filters.category hits /filter.php?c= and marks picks partial', async () => {
  const calls = mockJsonResponse(/filter\.php\?c=/, { meals: [MEAL_PARTIAL] });
  const out = await recipes.search({ filters: { category: 'Chicken' } });
  assert.equal(calls.length, 1);
  assert.ok(decodeURIComponent(calls[0].url).includes('c=Chicken'));
  assert.equal(out.length, 1);
  assert.equal(out[0].meta.partial, true);
  // Partial picks should still have id/title/image even without full data.
  assert.equal(out[0].id, 'recipe:52772');
  assert.equal(out[0].image, MEAL_PARTIAL.strMealThumb);
});

test('recipes.search: filters.area hits /filter.php?a=', async () => {
  const calls = mockJsonResponse(/filter\.php\?a=/, { meals: [MEAL_PARTIAL] });
  await recipes.search({ filters: { area: 'Japanese' } });
  assert.ok(decodeURIComponent(calls[0].url).includes('a=Japanese'));
});

test('recipes.search: filters.ingredient hits /filter.php?i=', async () => {
  const calls = mockJsonResponse(/filter\.php\?i=/, { meals: [MEAL_PARTIAL] });
  await recipes.search({ filters: { ingredient: 'chicken' } });
  assert.ok(decodeURIComponent(calls[0].url).includes('i=chicken'));
});

test('recipes.search: limit caps the result list', async () => {
  mockJsonResponse(/search\.php\?s=/, {
    meals: [MEAL_FULL, MEAL_FULL, MEAL_FULL, MEAL_FULL, MEAL_FULL],
  });
  const out = await recipes.search({ query: 'foo', limit: 3 });
  assert.equal(out.length, 3);
});

test('recipes.search: returns [] when upstream meals is null', async () => {
  mockJsonResponse(/search\.php\?s=/, { meals: null });
  const out = await recipes.search({ query: 'no-such-meal' });
  assert.deepEqual(out, []);
});

test('recipes.getDetails: hits /lookup.php?i= and returns full pick', async () => {
  const calls = mockJsonResponse(/lookup\.php\?i=/, MEAL_LIST_FULL);
  const p = await recipes.getDetails('52772');
  assert.equal(calls.length, 1);
  assert.ok(decodeURIComponent(calls[0].url).includes('i=52772'));
  assert.equal(p.id, 'recipe:52772');
  assert.equal(p.meta.ingredients.length, 3);
  assert.equal(p.meta.area, 'Japanese');
});

test('recipes.getDetails: returns partial pick when upstream has no meal', async () => {
  mockJsonResponse(/lookup\.php\?i=/, { meals: null });
  const p = await recipes.getDetails('does-not-exist');
  assert.equal(p, null);
});

test('recipes.search: throws on non-ok upstream', async () => {
  mockJsonResponse(/search\.php\?s=/, {}, { status: 500 });
  await assert.rejects(recipes.search({ query: 'foo' }), /recipes 500/);
});