/**
 * Unit tests for poolPartialPicks (lib/agent.js).
 *
 * CONTRACT:
 *   - Returns [] for empty/nullish input.
 *   - Respects the limit parameter.
 *   - Filters out entries with no poster or no title.
 *   - Applies kind filter ('film' | 'tv' | 'all').
 *   - Preserves the pool's input ordering (vote_count / rating).
 *   - Output picks have the exact field set the fast-path partial emits
 *     (no _vote_count; has id, title, poster, kind, match; badge optional).
 *   - IDs survive intact (required for client patch-by-id).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { poolPartialPicks } from '../lib/agent.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePick(overrides = {}) {
  return {
    id: 'tmdb:1',
    tmdbId: 1,
    title: 'Test Film',
    year: 2020,
    rating: 7.5,
    genres: ['Drama'],
    kind: 'film',
    poster: '/poster.jpg',
    blurb: 'A film.',
    _vote_count: 5000,
    ...overrides,
  };
}

const filmA = makePick({ id: 'tmdb:10', title: 'Film A', rating: 8.0, _vote_count: 10000, kind: 'film', poster: '/a.jpg' });
const filmB = makePick({ id: 'tmdb:11', title: 'Film B', rating: 7.5, _vote_count: 8000, kind: 'film', poster: '/b.jpg' });
const filmC = makePick({ id: 'tmdb:12', title: 'Film C', rating: 7.0, _vote_count: 6000, kind: 'film', poster: '/c.jpg' });
const tvA   = makePick({ id: 'tmdb:20', title: 'Show A', rating: 8.5, _vote_count: 9000, kind: 'tv',   poster: '/sa.jpg' });
const tvB   = makePick({ id: 'tmdb:21', title: 'Show B', rating: 7.2, _vote_count: 4000, kind: 'tv',   poster: '/sb.jpg' });

const noPoster  = makePick({ id: 'tmdb:30', title: 'No Poster', poster: null });
const noTitle   = makePick({ id: 'tmdb:31', title: '',   poster: '/x.jpg' });
const noTitle2  = makePick({ id: 'tmdb:32', title: null, poster: '/x.jpg' });

// ── Tests ────────────────────────────────────────────────────────────────────

test('poolPartialPicks: empty array → []', () => {
  assert.deepEqual(poolPartialPicks([]), []);
});

test('poolPartialPicks: null input → []', () => {
  assert.deepEqual(poolPartialPicks(null), []);
});

test('poolPartialPicks: undefined input → []', () => {
  assert.deepEqual(poolPartialPicks(undefined), []);
});

test('poolPartialPicks: no-opts call → []', () => {
  assert.deepEqual(poolPartialPicks(), []);
});

test('poolPartialPicks: all valid picks → non-empty', () => {
  const picks = poolPartialPicks([filmA, filmB, tvA]);
  assert.ok(picks.length > 0, 'should return picks');
});

test('poolPartialPicks: respects limit', () => {
  const candidates = [filmA, filmB, filmC, tvA, tvB];
  const picks = poolPartialPicks(candidates, { limit: 2 });
  assert.equal(picks.length, 2);
});

test('poolPartialPicks: filters out entries without poster', () => {
  const picks = poolPartialPicks([filmA, noPoster, filmB]);
  const ids = picks.map((p) => p.id);
  assert.ok(!ids.includes('tmdb:30'), 'posterless entry must be excluded');
  assert.ok(ids.includes('tmdb:10'), 'entry with poster must be included');
});

test('poolPartialPicks: filters out entries without title (empty string)', () => {
  const picks = poolPartialPicks([filmA, noTitle, filmB]);
  const ids = picks.map((p) => p.id);
  assert.ok(!ids.includes('tmdb:31'), 'empty-title entry must be excluded');
});

test('poolPartialPicks: filters out entries without title (null)', () => {
  const picks = poolPartialPicks([filmA, noTitle2, filmB]);
  const ids = picks.map((p) => p.id);
  assert.ok(!ids.includes('tmdb:32'), 'null-title entry must be excluded');
});

test('poolPartialPicks: kind=film filters out TV entries', () => {
  const picks = poolPartialPicks([filmA, tvA, filmB], { kind: 'film' });
  for (const p of picks) {
    assert.equal(p.kind, 'film', `expected kind=film, got ${p.kind}`);
  }
  // TV entry must be absent
  assert.ok(!picks.some((p) => p.id === 'tmdb:20'), 'TV entry must be excluded for kind=film');
});

test('poolPartialPicks: kind=tv filters out film entries', () => {
  const picks = poolPartialPicks([filmA, tvA, filmB], { kind: 'tv' });
  for (const p of picks) {
    assert.equal(p.kind, 'tv', `expected kind=tv, got ${p.kind}`);
  }
  assert.ok(!picks.some((p) => p.id === 'tmdb:10'), 'film entry must be excluded for kind=tv');
});

test('poolPartialPicks: kind=all returns both films and TV', () => {
  const picks = poolPartialPicks([filmA, tvA, filmB], { kind: 'all', limit: 10 });
  const hasFilm = picks.some((p) => p.kind === 'film');
  const hasTv   = picks.some((p) => p.kind === 'tv');
  assert.ok(hasFilm, 'all should include films');
  assert.ok(hasTv,   'all should include TV');
});

test('poolPartialPicks: preserves input ordering (feed sorted by vote_count desc, assert order)', () => {
  // Pre-sort candidates descending by _vote_count to represent pool order.
  // The helper must NOT invert this — the highest-vote item leads.
  const high  = makePick({ id: 'tmdb:100', title: 'High Votes',  _vote_count: 100_000, rating: 7.0, poster: '/h.jpg' });
  const mid   = makePick({ id: 'tmdb:101', title: 'Mid Votes',   _vote_count: 50_000,  rating: 7.0, poster: '/m.jpg' });
  const low   = makePick({ id: 'tmdb:102', title: 'Low Votes',   _vote_count: 1_000,   rating: 7.0, poster: '/l.jpg' });

  // Feed in shuffled order; caller has already sorted — let's feed sorted desc
  const candidates = [high, mid, low]; // already descending by _vote_count & equal rating
  const picks = poolPartialPicks(candidates, { limit: 3 });

  // rankAndBadge sorts by byScore([], []) = rating desc then _vote_count desc.
  // All have rating 7.0 → secondary sort by _vote_count → high first.
  assert.equal(picks[0].id, 'tmdb:100', 'highest vote_count item must lead when ratings are equal');
  assert.equal(picks[1].id, 'tmdb:101');
  assert.equal(picks[2].id, 'tmdb:102');
});

test('poolPartialPicks: output picks have exact fast-path field set (has id, title, poster, kind, match; no _vote_count)', () => {
  const picks = poolPartialPicks([filmA, filmB], { limit: 2 });
  assert.ok(picks.length >= 1, 'need at least one pick to inspect');

  const p = picks[0];

  // Required fields from the fast-path partial shape
  assert.ok('id' in p,     'must have id');
  assert.ok('title' in p,  'must have title');
  assert.ok('poster' in p, 'must have poster');
  assert.ok('kind' in p,   'must have kind');
  assert.ok('match' in p,  'must have match (added by rankAndBadge)');

  // _vote_count must be stripped by rankAndBadge
  assert.ok(!('_vote_count' in p), 'must NOT have _vote_count');

  // match must be a number in range
  assert.equal(typeof p.match, 'number', 'match must be a number');
  assert.ok(p.match >= 60 && p.match <= 99, `match ${p.match} must be in [60,99]`);

  // badge is optional but if present must have label and variant
  if (p.badge != null) {
    assert.ok('label' in p.badge,   'badge must have label');
    assert.ok('variant' in p.badge, 'badge must have variant');
  }
});

test('poolPartialPicks: ids survive intact (patch-by-id requirement)', () => {
  const candidates = [filmA, filmB, tvA];
  const picks = poolPartialPicks(candidates, { limit: 10 });
  const inputIds  = new Set(candidates.map((c) => c.id));
  for (const p of picks) {
    assert.ok(inputIds.has(p.id), `output id ${p.id} must match an input id exactly`);
  }
});

test('poolPartialPicks: returns [] when all entries are posterless', () => {
  const picks = poolPartialPicks([noPoster, noPoster], { limit: 10 });
  assert.deepEqual(picks, []);
});

test('poolPartialPicks: returns [] when all entries are titleless', () => {
  const picks = poolPartialPicks([noTitle, noTitle2], { limit: 10 });
  assert.deepEqual(picks, []);
});

test('poolPartialPicks: limit default is 10', () => {
  // Build 15 distinct candidates
  const many = Array.from({ length: 15 }, (_, i) =>
    makePick({ id: `tmdb:${200 + i}`, title: `Film ${i}`, poster: `/p${i}.jpg` }),
  );
  const picks = poolPartialPicks(many);
  assert.ok(picks.length <= 10, `default limit should cap at 10, got ${picks.length}`);
});
