/**
 * Unit tests for lib/shareset.js — pure share-set helpers.
 * Run with Node 20: node --test tests/shareset.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newShareId, sanitizeSetPicks, decodeKind } from '../lib/shareset.js';

// ── newShareId ─────────────────────────────────────────────────────────────

test('newShareId: returns 12-character base62 string', () => {
  const id = newShareId();
  assert.equal(typeof id, 'string');
  assert.equal(id.length, 12);
  assert.match(id, /^[0-9A-Za-z]{12}$/);
});

test('newShareId: two consecutive calls produce different IDs', () => {
  const a = newShareId();
  const b = newShareId();
  assert.notEqual(a, b);
});

// ── sanitizeSetPicks ───────────────────────────────────────────────────────

test('sanitizeSetPicks: only same-origin /img/ posters survive', () => {
  const result = sanitizeSetPicks([
    { tmdbId: 1, kind: 'film', title: 'Proxied', poster: '/img/w500/abc.jpg' },
    { tmdbId: 2, kind: 'film', title: 'Hotlink', poster: 'https://evil.example/track.gif' },
    { tmdbId: 3, kind: 'film', title: 'Protocol-relative', poster: '//evil.example/x.jpg' },
    { tmdbId: 4, kind: 'film', title: 'Non-string', poster: 42 },
  ]);
  assert.equal(result[0].poster, '/img/w500/abc.jpg');
  assert.equal(result[1].poster, null);
  assert.equal(result[2].poster, null);
  assert.equal(result[3].poster, null);
});

test('sanitizeSetPicks: caps at 8 picks', () => {
  const picks = Array.from({ length: 12 }, (_, i) => ({
    tmdbId: i + 1,
    kind: 'film',
    title: `Movie ${i + 1}`,
    year: 2020,
    poster: null,
  }));
  const result = sanitizeSetPicks(picks);
  assert.equal(result.length, 8);
});

test('sanitizeSetPicks: drops entries with missing tmdbId', () => {
  const picks = [
    { kind: 'film', title: 'No ID', year: 2020, poster: null },
    { tmdbId: 42, kind: 'film', title: 'Has ID', year: 2020, poster: null },
  ];
  const result = sanitizeSetPicks(picks);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 42);
});

test('sanitizeSetPicks: drops entries with non-integer tmdbId', () => {
  const picks = [
    { tmdbId: '12.5', kind: 'film', title: 'Float string', year: 2020, poster: null },
    { tmdbId: 3.7, kind: 'film', title: 'Float', year: 2020, poster: null },
    { tmdbId: NaN, kind: 'film', title: 'NaN', year: 2020, poster: null },
    { tmdbId: 'abc', kind: 'film', title: 'String', year: 2020, poster: null },
    { tmdbId: 7, kind: 'film', title: 'Valid', year: 2020, poster: null },
  ];
  const result = sanitizeSetPicks(picks);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 7);
});

test('sanitizeSetPicks: coerces unknown kind to "film"', () => {
  const picks = [
    { tmdbId: 1, kind: 'movie', title: 'Movie kind', year: 2020, poster: null },
    { tmdbId: 2, kind: undefined, title: 'No kind', year: 2020, poster: null },
    { tmdbId: 3, kind: 'other', title: 'Other kind', year: 2020, poster: null },
  ];
  const result = sanitizeSetPicks(picks);
  assert.equal(result.length, 3);
  for (const r of result) {
    assert.equal(r.kind, 'film');
  }
});

test('sanitizeSetPicks: preserves "tv" kind', () => {
  const picks = [{ tmdbId: 1, kind: 'tv', title: 'Show', year: 2020, poster: null }];
  const result = sanitizeSetPicks(picks);
  assert.equal(result[0].kind, 'tv');
});

test('sanitizeSetPicks: truncates title to 200 chars', () => {
  const longTitle = 'A'.repeat(300);
  const picks = [{ tmdbId: 1, kind: 'film', title: longTitle, year: 2020, poster: null }];
  const result = sanitizeSetPicks(picks);
  assert.equal(result[0].title.length, 200);
});

test('sanitizeSetPicks: coerces year to integer or null', () => {
  const picks = [
    { tmdbId: 1, kind: 'film', title: 'Int year', year: 2021, poster: null },
    { tmdbId: 2, kind: 'film', title: 'String year', year: '2022', poster: null },
    { tmdbId: 3, kind: 'film', title: 'Float year', year: 2023.5, poster: null },
    { tmdbId: 4, kind: 'film', title: 'Null year', year: null, poster: null },
    { tmdbId: 5, kind: 'film', title: 'No year', poster: null },
  ];
  const result = sanitizeSetPicks(picks);
  assert.equal(result[0].year, 2021);
  assert.equal(typeof result[0].year, 'number');
  // String year: Number('2022')=2022, Math.trunc(2022)=2022 → integer
  assert.equal(result[1].year, 2022);
  // Float year: Math.trunc(2023.5)=2023 → integer
  assert.equal(result[2].year, 2023);
  assert.equal(result[3].year, null);
  assert.equal(result[4].year, null);
});

test('sanitizeSetPicks: truncates poster to 500 chars or null', () => {
  const longPoster = '/img/' + 'x'.repeat(600);
  const picks = [
    { tmdbId: 1, kind: 'film', title: 'Long poster', year: 2020, poster: longPoster },
    { tmdbId: 2, kind: 'film', title: 'No poster', year: 2020, poster: null },
  ];
  const result = sanitizeSetPicks(picks);
  assert.equal(result[0].poster.length, 500);
  assert.equal(result[1].poster, null);
});

test('sanitizeSetPicks: output entries have exactly the right shape', () => {
  const picks = [{ tmdbId: 42, kind: 'tv', title: 'Test Show', year: 2020, poster: '/img/w500/abc.jpg', extra: 'ignored' }];
  const result = sanitizeSetPicks(picks);
  assert.equal(result.length, 1);
  const keys = Object.keys(result[0]).sort();
  assert.deepEqual(keys, ['kind', 'poster', 'title', 'tmdbId', 'year']);
});

test('sanitizeSetPicks: returns [] for null', () => {
  assert.deepEqual(sanitizeSetPicks(null), []);
});

test('sanitizeSetPicks: returns [] for non-array string', () => {
  assert.deepEqual(sanitizeSetPicks('x'), []);
});

test('sanitizeSetPicks: returns [] for plain object', () => {
  assert.deepEqual(sanitizeSetPicks({}), []);
});

test('sanitizeSetPicks: does not throw for any of those inputs', () => {
  assert.doesNotThrow(() => sanitizeSetPicks(null));
  assert.doesNotThrow(() => sanitizeSetPicks('x'));
  assert.doesNotThrow(() => sanitizeSetPicks({}));
  assert.doesNotThrow(() => sanitizeSetPicks(undefined));
});

// ── decodeKind ─────────────────────────────────────────────────────────────

test('decodeKind: "tv" → "tv"', () => {
  assert.equal(decodeKind('tv'), 'tv');
});

test('decodeKind: "film" → "film"', () => {
  assert.equal(decodeKind('film'), 'film');
});

test('decodeKind: "all" → "all"', () => {
  assert.equal(decodeKind('all'), 'all');
});

test('decodeKind: unknown string "banana" → "all"', () => {
  assert.equal(decodeKind('banana'), 'all');
});

test('decodeKind: undefined → "all"', () => {
  assert.equal(decodeKind(undefined), 'all');
});

test('decodeKind: null → "all"', () => {
  assert.equal(decodeKind(null), 'all');
});
