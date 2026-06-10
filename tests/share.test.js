/**
 * Unit tests for lib/share.js — pure share-link helpers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shareUrlFor, resizeImagePath } from '../lib/share.js';

test('shareUrlFor: film', () => {
  assert.equal(shareUrlFor({ tmdbId: 693134, kind: 'film' }), '/title/film/693134');
});

test('shareUrlFor: tv', () => {
  assert.equal(shareUrlFor({ tmdbId: 1396, kind: 'tv' }), '/title/tv/1396');
});

test('shareUrlFor: unknown kind defaults to film', () => {
  assert.equal(shareUrlFor({ tmdbId: 5 }), '/title/film/5');
});

test('shareUrlFor: no tmdbId → null', () => {
  assert.equal(shareUrlFor({ kind: 'film' }), null);
});

test('shareUrlFor: nullish pick → null', () => {
  assert.equal(shareUrlFor(null), null);
});

test('resizeImagePath: swaps proxied size segment', () => {
  assert.equal(resizeImagePath('/img/w500/abc.jpg', 'w342'), '/img/w342/abc.jpg');
});

test('resizeImagePath: swaps "original" in absolute TMDB URLs', () => {
  assert.equal(
    resizeImagePath('https://image.tmdb.org/t/p/original/x.jpg', 'w780'),
    'https://image.tmdb.org/t/p/w780/x.jpg',
  );
});

test('resizeImagePath: no size segment → input unchanged', () => {
  assert.equal(resizeImagePath('/foo/bar.jpg', 'w342'), '/foo/bar.jpg');
});

test('resizeImagePath: nullish src → null', () => {
  assert.equal(resizeImagePath(null, 'w342'), null);
  assert.equal(resizeImagePath(undefined, 'w342'), null);
});

test('resizeImagePath: missing size → input unchanged', () => {
  assert.equal(resizeImagePath('/img/w500/abc.jpg', ''), '/img/w500/abc.jpg');
});
