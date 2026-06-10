/**
 * Unit tests for lib/agent.js deterministic helpers (no LLM, no network).
 * Focus: compound-genre queries like "sci-fi thriller" must keep sci-fi TV +
 * films and rank the thriller-flavoured ones first — not collapse to generic
 * thrillers with zero TV.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractConstraints, applyFilters, rankAndBadge } from '../lib/agent.js';

// Genre names exactly as lib/tmdb.js emits them (movie 878 → "Sci-Fi",
// tv 10765 → "Sci-Fi & Fantasy"; TMDB TV has no "Thriller" genre at all).
const sciFiThrillerFilm = { id: 'tmdb:1', title: 'Minority Report', kind: 'film', rating: 7.4, genres: ['Action', 'Thriller', 'Sci-Fi', 'Mystery'], poster: 'x' };
const pureSciFiFilm = { id: 'tmdb:2', title: 'Arrival', kind: 'film', rating: 7.6, genres: ['Drama', 'Sci-Fi', 'Mystery'], poster: 'x' };
const pureCrimeThriller = { id: 'tmdb:3', title: 'Se7en', kind: 'film', rating: 8.3, genres: ['Crime', 'Mystery', 'Thriller'], poster: 'x' };
const sciFiShow = { id: 'tmdb:4', title: 'Severance', kind: 'tv', rating: 8.4, genres: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], poster: 'x' };
const comedyShow = { id: 'tmdb:5', title: 'The Office', kind: 'tv', rating: 8.6, genres: ['Comedy'], poster: 'x' };

test('extractConstraints: "sci-fi thriller" → Sci-Fi primary, Thriller secondary', () => {
  const c = extractConstraints('id like to watch a sci-fi thriller');
  assert.deepEqual(c.requireGenres, ['Sci-Fi', 'Thriller']);
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
