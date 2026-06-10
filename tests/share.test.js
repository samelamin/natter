/**
 * Unit tests for lib/share.js — pure share-link helpers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shareUrlFor } from '../lib/share.js';

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
