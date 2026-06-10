/**
 * Unit tests for lib/watchlistItem.js — pure watchlist body helper.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toWatchlistBody } from '../lib/watchlistItem.js';

// ── Null / missing tmdbId ───────────────────────────────────────────────────

test('toWatchlistBody: returns null when item is null', () => {
  assert.equal(toWatchlistBody(null), null);
});

test('toWatchlistBody: returns null when item is undefined', () => {
  assert.equal(toWatchlistBody(undefined), null);
});

test('toWatchlistBody: returns null when tmdbId is missing', () => {
  assert.equal(toWatchlistBody({ kind: 'film', title: 'Dune' }), null);
});

test('toWatchlistBody: returns null when tmdbId is "abc"', () => {
  assert.equal(toWatchlistBody({ tmdbId: 'abc', kind: 'film', title: 'Dune' }), null);
});

test('toWatchlistBody: returns null when tmdbId is NaN', () => {
  assert.equal(toWatchlistBody({ tmdbId: NaN, kind: 'film', title: 'Dune' }), null);
});

test('toWatchlistBody: accepts integer tmdbId 27205', () => {
  const body = toWatchlistBody({ tmdbId: 27205, kind: 'film', title: 'Dune' });
  assert.ok(body !== null);
  assert.equal(body.tmdbId, 27205);
});

test('toWatchlistBody: accepts string "27205" and coerces to Number 27205', () => {
  const body = toWatchlistBody({ tmdbId: '27205', kind: 'film', title: 'Dune' });
  assert.ok(body !== null);
  assert.equal(body.tmdbId, 27205);
  assert.equal(typeof body.tmdbId, 'number');
});

// ── kind mapping ───────────────────────────────────────────────────────────

test('toWatchlistBody: maps kind "movie" → "film"', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'movie', title: 'X' });
  assert.equal(body.kind, 'film');
});

test('toWatchlistBody: maps kind "film" → "film"', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X' });
  assert.equal(body.kind, 'film');
});

test('toWatchlistBody: maps kind "tv" → "tv"', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'tv', title: 'X' });
  assert.equal(body.kind, 'tv');
});

test('toWatchlistBody: maps kind undefined → "film"', () => {
  const body = toWatchlistBody({ tmdbId: 1, title: 'X' });
  assert.equal(body.kind, 'film');
});

test('toWatchlistBody: maps unknown kind → "film"', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'series', title: 'X' });
  assert.equal(body.kind, 'film');
});

// ── title / poster ─────────────────────────────────────────────────────────

test('toWatchlistBody: slices a 400-char title to 300', () => {
  const longTitle = 'A'.repeat(400);
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: longTitle });
  assert.equal(body.title.length, 300);
});

test('toWatchlistBody: title defaults to empty string when missing', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film' });
  assert.equal(body.title, '');
});

test('toWatchlistBody: uses item.poster when present', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', poster: '/poster.jpg', posterSrc: '/src.jpg' });
  assert.equal(body.poster, '/poster.jpg');
});

test('toWatchlistBody: falls back to item.posterSrc when poster is absent', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', posterSrc: '/src.jpg' });
  assert.equal(body.poster, '/src.jpg');
});

test('toWatchlistBody: poster is null when both poster and posterSrc are absent', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X' });
  assert.equal(body.poster, null);
});

test('toWatchlistBody: slices a 600-char poster URL to 500', () => {
  const longPoster = 'https://example.com/' + 'x'.repeat(580);
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', poster: longPoster });
  assert.equal(body.poster.length, 500);
});

// ── year coercion ──────────────────────────────────────────────────────────

test('toWatchlistBody: integer year stays as-is', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', year: 1999 });
  assert.equal(body.year, 1999);
});

test('toWatchlistBody: coerces non-integer year "1999.5" to null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', year: '1999.5' });
  assert.equal(body.year, null);
});

test('toWatchlistBody: coerces non-integer year "abc" to null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', year: 'abc' });
  assert.equal(body.year, null);
});

test('toWatchlistBody: year null stays null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', year: null });
  assert.equal(body.year, null);
});

test('toWatchlistBody: year undefined maps to null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X' });
  assert.equal(body.year, null);
});

// ── rating coercion ────────────────────────────────────────────────────────

test('toWatchlistBody: number rating is preserved', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', rating: 7.4 });
  assert.equal(body.rating, 7.4);
});

test('toWatchlistBody: coerces non-number rating to null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', rating: '7.4' });
  assert.equal(body.rating, null);
});

test('toWatchlistBody: rating null stays null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X', rating: null });
  assert.equal(body.rating, null);
});

test('toWatchlistBody: rating undefined maps to null', () => {
  const body = toWatchlistBody({ tmdbId: 1, kind: 'film', title: 'X' });
  assert.equal(body.rating, null);
});

// ── full output shape ──────────────────────────────────────────────────────

test('toWatchlistBody: returns exactly the expected fields', () => {
  const body = toWatchlistBody({
    tmdbId: 27205,
    kind: 'film',
    title: 'Inception',
    poster: '/poster.jpg',
    year: 2010,
    rating: 8.4,
  });
  assert.deepEqual(Object.keys(body).sort(), ['kind', 'poster', 'rating', 'title', 'tmdbId', 'year'].sort());
});
