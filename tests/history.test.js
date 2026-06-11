/**
 * Unit tests for lib/history.js — pure logic, no React, no network, no DB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeHistoryPicks, historyLabel, historyOverlapRatio, findSupersededHistoryIds } from '../lib/history.js';

// ── sanitizeHistoryPicks ─────────────────────────────────────────────────────

test('sanitizeHistoryPicks: caps to 10 entries when given 25', () => {
  const picks = Array.from({ length: 25 }, (_, i) => ({
    id: `id${i}`,
    tmdbId: 100 + i,
    kind: 'film',
    title: `Film ${i}`,
    poster: null,
    year: 2020,
    rating: 7.5,
    reason: null,
  }));
  const result = sanitizeHistoryPicks(picks);
  assert.equal(result.length, 10);
});

test('sanitizeHistoryPicks: drops entries with null/undefined/NaN/string tmdbId', () => {
  const picks = [
    { id: 'a', tmdbId: null, kind: 'film', title: 'Null id' },
    { id: 'b', tmdbId: undefined, kind: 'film', title: 'Undefined id' },
    { id: 'c', tmdbId: NaN, kind: 'film', title: 'NaN id' },
    { id: 'd', tmdbId: 'abc', kind: 'film', title: 'String id' },
    { id: 'e', tmdbId: 0, kind: 'film', title: 'Zero id' },
    { id: 'f', tmdbId: 12345, kind: 'film', title: 'Valid' },
  ];
  const result = sanitizeHistoryPicks(picks);
  // Only the valid entry (tmdbId 12345) should survive
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Valid');
  assert.equal(result[0].tmdbId, 12345);
});

test('sanitizeHistoryPicks: truncates title to 200, reason to 280, coerces non-integer year to null, coerces kind', () => {
  const longTitle = 'A'.repeat(300);
  const longReason = 'B'.repeat(400);

  const picks = [
    {
      id: 'x',
      tmdbId: 42,
      kind: 'movie',     // should become 'film'
      title: longTitle,
      poster: null,
      year: 3.7,         // non-integer → null
      rating: 8,
      reason: longReason,
    },
    {
      id: 'y',
      tmdbId: 99,
      kind: 'tv',        // should stay 'tv'
      title: 'Short',
      poster: '/img/foo.jpg',
      year: 2022,        // valid integer
      rating: null,
      reason: null,
    },
  ];

  const result = sanitizeHistoryPicks(picks);
  assert.equal(result.length, 2);

  const first = result[0];
  assert.equal(first.kind, 'film');
  assert.equal(first.title.length, 200);
  assert.equal(first.year, null);
  assert.equal(first.reason.length, 280);

  const second = result[1];
  assert.equal(second.kind, 'tv');
  assert.equal(second.year, 2022);
  assert.equal(second.reason, null);
});

test('sanitizeHistoryPicks: returns [] for non-array / null / undefined input without throwing', () => {
  assert.deepEqual(sanitizeHistoryPicks(null), []);
  assert.deepEqual(sanitizeHistoryPicks(undefined), []);
  assert.deepEqual(sanitizeHistoryPicks('not an array'), []);
  assert.deepEqual(sanitizeHistoryPicks(42), []);
  assert.deepEqual(sanitizeHistoryPicks({}), []);
});

// ── historyLabel ─────────────────────────────────────────────────────────────

test('historyLabel: returns the trimmed query', () => {
  assert.equal(historyLabel({ query: '  something good  ' }), 'something good');
  assert.equal(historyLabel({ query: 'a French heist film' }), 'a French heist film');
});

test('historyLabel: returns empty string and does not throw for {} / null / undefined', () => {
  assert.equal(historyLabel({}), '');
  assert.doesNotThrow(() => historyLabel(null));
  assert.equal(historyLabel(null), '');
  assert.doesNotThrow(() => historyLabel(undefined));
  assert.equal(historyLabel(undefined), '');
});

// ── historyIdFrom ─────────────────────────────────────────────────────────────

import { historyIdFrom } from '../lib/history.js';

test('historyIdFrom: returns 7 for integer 7', () => {
  assert.equal(historyIdFrom(7), 7);
});

test('historyIdFrom: returns 7 for string "7"', () => {
  assert.equal(historyIdFrom('7'), 7);
});

test('historyIdFrom: returns null for 0', () => {
  assert.equal(historyIdFrom(0), null);
});

test('historyIdFrom: returns null for negative integer -3', () => {
  assert.equal(historyIdFrom(-3), null);
});

test('historyIdFrom: returns null for float 1.5', () => {
  assert.equal(historyIdFrom(1.5), null);
});

test('historyIdFrom: returns null for string "1.5"', () => {
  assert.equal(historyIdFrom('1.5'), null);
});

test('historyIdFrom: returns null for non-numeric string "abc"', () => {
  assert.equal(historyIdFrom('abc'), null);
});

test('historyIdFrom: returns null for NaN', () => {
  assert.equal(historyIdFrom(NaN), null);
});

test('historyIdFrom: returns null for null', () => {
  assert.equal(historyIdFrom(null), null);
});

test('historyIdFrom: returns null for undefined', () => {
  assert.equal(historyIdFrom(undefined), null);
});

// ── historyOverlapRatio ───────────────────────────────────────────────────────

function makePicks(tmdbIds, kind = 'film') {
  return tmdbIds.map((id) => ({ tmdbId: id, kind, title: `Title ${id}`, id: `t${id}` }));
}

test('historyOverlapRatio: identical sets of 5 → 1', () => {
  const a = makePicks([1, 2, 3, 4, 5]);
  const b = makePicks([1, 2, 3, 4, 5]);
  assert.equal(historyOverlapRatio(a, b), 1);
});

test('historyOverlapRatio: completely disjoint sets → 0', () => {
  const a = makePicks([1, 2, 3]);
  const b = makePicks([4, 5, 6]);
  assert.equal(historyOverlapRatio(a, b), 0);
});

test('historyOverlapRatio: half-overlap uses min(|A|,|B|) as denominator', () => {
  // A has 10 items, B has 4 items, 2 in common → 2/min(10,4)=2/4=0.5
  const a = makePicks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const b = makePicks([1, 2, 20, 21]);
  assert.equal(historyOverlapRatio(a, b), 0.5);
});

test('historyOverlapRatio: empty array A → 0', () => {
  assert.equal(historyOverlapRatio([], makePicks([1, 2])), 0);
});

test('historyOverlapRatio: empty array B → 0', () => {
  assert.equal(historyOverlapRatio(makePicks([1, 2]), []), 0);
});

test('historyOverlapRatio: null A → 0', () => {
  assert.equal(historyOverlapRatio(null, makePicks([1])), 0);
});

test('historyOverlapRatio: non-array A → 0', () => {
  assert.equal(historyOverlapRatio('bad', makePicks([1])), 0);
});

test('historyOverlapRatio: malformed entries (missing tmdbId) are skipped', () => {
  const a = [{ kind: 'film' }, { tmdbId: 1, kind: 'film' }, { tmdbId: 'abc', kind: 'film' }];
  const b = [{ tmdbId: 1, kind: 'film' }];
  // valid in A: just tmdbId:1; valid in B: tmdbId:1; intersection=1; min(1,1)=1 → 1.0
  assert.equal(historyOverlapRatio(a, b), 1);
});

test('historyOverlapRatio: kind distinguishes same tmdbId (film vs tv)', () => {
  const a = [{ tmdbId: 1, kind: 'film' }];
  const b = [{ tmdbId: 1, kind: 'tv' }];
  assert.equal(historyOverlapRatio(a, b), 0);
});

// ── findSupersededHistoryIds ──────────────────────────────────────────────────

const PROD_IDS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
const prodPicks = makePicks(PROD_IDS);

test('findSupersededHistoryIds: exact query match (case/whitespace-insensitive)', () => {
  const rows = [
    { id: 1, query: 'Fancy comedy tonight.', picks: makePicks([1, 2, 3]) },
    { id: 2, query: 'something else', picks: makePicks([4, 5, 6]) },
  ];
  const result = findSupersededHistoryIds(rows, '  fancy comedy tonight.  ', makePicks([7, 8, 9]));
  assert.deepEqual(result, [1]);
});

test('findSupersededHistoryIds: overlap ≥ 0.6 catches production duplicate pair', () => {
  // Two rows with the same 10 tmdbIds, different query strings
  const rows = [
    { id: 10, query: 'Fancy comedy tonight.', picks: prodPicks },
    { id: 11, query: 'unrelated query', picks: makePicks([200, 201, 202]) },
  ];
  // incoming: "I fancy comedy tonight." with same 10 picks
  const result = findSupersededHistoryIds(rows, 'I fancy comedy tonight.', prodPicks);
  assert.ok(result.includes(10), 'should supersede id 10 (high overlap)');
  assert.ok(!result.includes(11), 'should not supersede id 11 (different picks)');
});

test('findSupersededHistoryIds: overlap 0.3 is NOT superseded', () => {
  // 3 of 10 in common → 0.3 < 0.6
  const a = makePicks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const b = makePicks([1, 2, 3, 20, 21, 22, 23, 24, 25, 26]);
  const rows = [{ id: 99, query: 'other query', picks: a }];
  const result = findSupersededHistoryIds(rows, 'different query', b);
  assert.deepEqual(result, []);
});

test('findSupersededHistoryIds: bad inputs → []', () => {
  assert.deepEqual(findSupersededHistoryIds(null, 'q', prodPicks), []);
  assert.deepEqual(findSupersededHistoryIds(undefined, 'q', prodPicks), []);
  assert.deepEqual(findSupersededHistoryIds('bad', 'q', prodPicks), []);
  assert.deepEqual(findSupersededHistoryIds([], null, prodPicks), []);
  assert.deepEqual(findSupersededHistoryIds([], 'q', null), []);
});

test('findSupersededHistoryIds: returns BOTH an exact-query id and an overlap id', () => {
  const rows = [
    { id: 1, query: 'exact match query', picks: makePicks([50, 51, 52]) },
    { id: 2, query: 'totally different query', picks: prodPicks },
  ];
  // incoming matches id:1 by exact query, and id:2 by overlap
  const result = findSupersededHistoryIds(rows, 'Exact Match Query', prodPicks);
  assert.ok(result.includes(1), 'should include exact-match id 1');
  assert.ok(result.includes(2), 'should include overlap id 2');
  assert.equal(result.length, 2);
});
