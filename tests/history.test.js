/**
 * Unit tests for lib/history.js — pure logic, no React, no network, no DB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeHistoryPicks, historyLabel } from '../lib/history.js';

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
