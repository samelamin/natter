/**
 * Unit tests for lib/agent.js deterministic helpers (no LLM, no network).
 * Focus: compound-genre queries like "sci-fi thriller" must keep sci-fi TV +
 * films and rank the thriller-flavoured ones first — not collapse to generic
 * thrillers with zero TV.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractConstraints,
  applyFilters,
  rankAndBadge,
  demoteGenresFor,
  languageFromQuery,
  dedupeByTitle,
} from '../lib/agent.js';

// Genre names exactly as lib/tmdb.js emits them (movie 878 → "Sci-Fi",
// tv 10765 → "Sci-Fi & Fantasy"; TMDB TV has no "Thriller" genre at all).
const sciFiThrillerFilm = { id: 'tmdb:1', title: 'Minority Report', kind: 'film', rating: 7.4, genres: ['Action', 'Thriller', 'Sci-Fi', 'Mystery'], poster: 'x' };
const pureSciFiFilm = { id: 'tmdb:2', title: 'Arrival', kind: 'film', rating: 7.6, genres: ['Drama', 'Sci-Fi', 'Mystery'], poster: 'x' };
const pureCrimeThriller = { id: 'tmdb:3', title: 'Se7en', kind: 'film', rating: 8.3, genres: ['Crime', 'Mystery', 'Thriller'], poster: 'x' };
const sciFiShow = { id: 'tmdb:4', title: 'Severance', kind: 'tv', rating: 8.4, genres: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], poster: 'x' };
const comedyShow = { id: 'tmdb:5', title: 'The Office', kind: 'tv', rating: 8.6, genres: ['Comedy'], poster: 'x' };
// Animation-skew fixtures: a higher-rated animated sci-fi show vs a live-action one.
const animatedSciFiShow = { id: 'tmdb:6', title: 'Arcane', kind: 'tv', rating: 9.0, genres: ['Animation', 'Action & Adventure', 'Sci-Fi & Fantasy'], poster: 'x' };
const liveActionSciFiShow = { id: 'tmdb:7', title: 'The Expanse', kind: 'tv', rating: 8.4, genres: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], poster: 'x' };

test('extractConstraints: "sci-fi thriller" → Sci-Fi primary, Thriller secondary', () => {
  const c = extractConstraints('id like to watch a sci-fi thriller');
  assert.deepEqual(c.requireGenres, ['Sci-Fi', 'Thriller']);
});

test('extractConstraints: spoken forms without hyphens ("sci fi", "rom com")', () => {
  // Voice transcripts rarely hyphenate — "a sci fi thriller" must parse the
  // same as "a sci-fi thriller", or the primary genre becomes Thriller and
  // every TV pick is filtered out (TMDB TV has no Thriller genre).
  const c = extractConstraints('a sci fi thriller');
  assert.deepEqual(c.requireGenres, ['Sci-Fi', 'Thriller']);
  const r = extractConstraints('a rom com with a feel good story');
  assert.deepEqual(r.requireGenres, ['Romance']);
});

test('extractConstraints: "rom com" does not false-positive inside "from comedy"', () => {
  const c = extractConstraints('films from comedy directors');
  assert.deepEqual(c.requireGenres, ['Comedy']);
});

// ── Query language detection (locale-accurate recommendations) ──────────────

test('languageFromQuery: detects non-Latin scripts', () => {
  assert.equal(languageFromQuery('فيلم كوميدي'), 'ar'); // Arabic
  assert.equal(languageFromQuery('фильм ужасов'), 'ru'); // Cyrillic
  assert.equal(languageFromQuery('面白い映画'), 'ja'); // kana present → Japanese
  assert.equal(languageFromQuery('恐怖电影'), 'zh'); // Han only → Chinese
  assert.equal(languageFromQuery('웃긴 영화'), 'ko'); // Hangul
  assert.equal(languageFromQuery('סרט קומדיה'), 'he'); // Hebrew
});

test('languageFromQuery: English/Latin queries return null (no locale filter)', () => {
  assert.equal(languageFromQuery('a feel-good comedy'), null);
  assert.equal(languageFromQuery('une comédie romantique'), null); // Latin-script — LLM handles
  assert.equal(languageFromQuery(''), null);
});

test('languageFromQuery: mixed-script query still detects the non-Latin language', () => {
  // e.g. Arabic asking for something like an English-titled show
  assert.equal(languageFromQuery('مسلسل مثل game of thrones'), 'ar');
});

test('extractConstraints: Arabic genre words map to TMDB genres', () => {
  assert.deepEqual(extractConstraints('فيلم كوميدي').requireGenres, ['Comedy']);
  assert.deepEqual(extractConstraints('مسلسل دراما').requireGenres, ['Drama']);
  assert.deepEqual(extractConstraints('فيلم رعب').requireGenres, ['Horror']);
  assert.deepEqual(extractConstraints('فيلم أكشن').requireGenres, ['Action']);
  assert.deepEqual(extractConstraints('خيال علمي').requireGenres, ['Sci-Fi']);
});

test('demoteGenresFor: Arabic anime/cartoon words lift the Animation demote', () => {
  assert.deepEqual(demoteGenresFor('انمي'), []);
  assert.deepEqual(demoteGenresFor('رسوم متحركة للأطفال'), []);
  assert.deepEqual(demoteGenresFor('فيلم كوميدي'), ['Animation']);
});

test('dedupeByTitle: non-Latin titles are kept, not dropped as empty keys', () => {
  // normalizeTitle used to strip [^a-z0-9], so every pure-Arabic (or CJK,
  // Cyrillic…) title normalized to '' and the whole pick was discarded —
  // Arabic searches returned at most the odd title containing a digit.
  const a = { id: 'tmdb:1', title: 'أبو شنب', kind: 'film', rating: 6.5, genres: ['Comedy'], poster: 'x' };
  const b = { id: 'tmdb:2', title: 'عسل أسود', kind: 'film', rating: 7.1, genres: ['Comedy'], poster: 'x' };
  const out = dedupeByTitle([a, b]);
  assert.equal(out.length, 2, 'two distinct Arabic titles must both survive');
});

test('dedupeByTitle: identical non-Latin titles still dedupe', () => {
  const a = { id: 'tmdb:1', title: 'أبو شنب', kind: 'film', rating: 6.5, genres: ['Comedy'], poster: null };
  const b = { id: 'tmdb:9', title: 'أبو شنب', kind: 'film', rating: 6.5, genres: ['Comedy'], poster: 'x' };
  const out = dedupeByTitle([a, b]);
  assert.equal(out.length, 1, 'same Arabic title across ids must collapse');
  assert.ok(out[0].poster, 'the entry with a poster wins');
});

test('applyFilters: sci-fi TV survives a "sci-fi thriller" query', () => {
  const c = extractConstraints('sci-fi thriller');
  const out = applyFilters([sciFiShow, comedyShow], 'all', c);
  assert.ok(out.includes(sciFiShow), '"Sci-Fi & Fantasy" show must pass the sci-fi primary filter');
  assert.ok(!out.includes(comedyShow), 'non-sci-fi show must be filtered out');
});

test('applyFilters: pure crime thriller is excluded from a "sci-fi thriller" query', () => {
  const c = extractConstraints('sci-fi thriller');
  const out = applyFilters([sciFiThrillerFilm, pureCrimeThriller], 'all', c);
  assert.ok(out.includes(sciFiThrillerFilm), 'sci-fi thriller film must pass');
  assert.ok(!out.includes(pureCrimeThriller), 'crime thriller with no sci-fi must not appear');
});

test('rankAndBadge: secondary genre boosts a sci-fi thriller above plain sci-fi', () => {
  const boosts = extractConstraints('sci-fi thriller').requireGenres.slice(1); // ['Thriller']
  // Arrival has the higher rating; without the boost it would rank first.
  const ranked = rankAndBadge([pureSciFiFilm, sciFiThrillerFilm], 24, boosts);
  assert.equal(ranked[0].title, 'Minority Report', 'thriller-flavoured sci-fi should rank first');
});

test('applyFilters: single-genre query is unchanged (comedy keeps comedies only)', () => {
  const c = extractConstraints('feel-good comedy');
  const out = applyFilters([comedyShow, sciFiShow], 'all', c);
  assert.ok(out.includes(comedyShow));
  assert.ok(!out.includes(sciFiShow));
});

// ── Animation down-weighting (sci-fi TV skews to anime otherwise) ───────────

test('demoteGenresFor: demotes Animation unless the query asks for it', () => {
  assert.deepEqual(demoteGenresFor('id like to watch a sci-fi thriller'), ['Animation']);
  assert.deepEqual(demoteGenresFor('animated sci-fi shows'), []);
  assert.deepEqual(demoteGenresFor('anime'), []);
  assert.deepEqual(demoteGenresFor('a cartoon for the kids'), []);
});

test('rankAndBadge: animation is demoted below live-action when not requested', () => {
  // Arcane has the higher rating; demoting Animation must still rank The Expanse first.
  const ranked = rankAndBadge([animatedSciFiShow, liveActionSciFiShow], 24, [], ['Animation']);
  assert.equal(ranked[0].title, 'The Expanse', 'live-action sci-fi should outrank higher-rated animation when demoted');
});

test('rankAndBadge: without an animation demote, higher-rated animation ranks first', () => {
  const ranked = rankAndBadge([animatedSciFiShow, liveActionSciFiShow], 24, [], []);
  assert.equal(ranked[0].title, 'Arcane', 'control: rating wins when nothing is demoted');
});
