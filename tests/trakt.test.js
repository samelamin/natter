/**
 * Unit tests for lib/trakt.js — pure helpers only.
 * No network, no database.
 *
 * Sets TRAKT_TOKEN_KEY to a fixed test value; restores original env after each
 * test suite section.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Fixed 64-hex test key — not a real credential.
const TEST_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

const origKey = process.env.TRAKT_TOKEN_KEY;
process.env.TRAKT_TOKEN_KEY = TEST_KEY;

import {
  encryptToken,
  decryptToken,
  buildWatchlistPayload,
  extractWatchedIds,
  pollOutcome,
  traktHeaders,
  needsRefresh,
  traktConfigured,
} from '../lib/trakt.js';

// ── encryptToken / decryptToken ───────────────────────────────────────────────

test('encryptToken produces iv.tag.cipher format (3 segments)', () => {
  const stored = encryptToken('hello_token');
  const parts = stored.split('.');
  assert.equal(parts.length, 3, 'should have 3 base64url segments');
  assert.ok(parts.every((p) => p.length > 0), 'each segment should be non-empty');
});

test('encryptToken output contains only base64url-safe chars', () => {
  const stored = encryptToken('some_access_token_value');
  assert.doesNotMatch(stored, /[+/=]/, 'should not contain +, /, or = (base64url)');
});

test('decryptToken round-trip: recovers the original value', () => {
  const plain = 'my_secret_access_token_123';
  const stored = encryptToken(plain);
  assert.equal(decryptToken(stored), plain);
});

test('decryptToken round-trip: works with a long token', () => {
  const long = 'x'.repeat(512);
  assert.equal(decryptToken(encryptToken(long)), long);
});

test('decryptToken: each encryption produces a different ciphertext', () => {
  const plain = 'same_input';
  const a = encryptToken(plain);
  const b = encryptToken(plain);
  assert.notEqual(a, b, 'IVs should differ — ciphertexts must not be identical');
  // Both must still decrypt correctly
  assert.equal(decryptToken(a), plain);
  assert.equal(decryptToken(b), plain);
});

test('decryptToken returns null for garbage input', () => {
  assert.equal(decryptToken('not.valid.base64url!!!'), null);
});

test('decryptToken returns null for empty string', () => {
  assert.equal(decryptToken(''), null);
});

test('decryptToken returns null for null', () => {
  assert.equal(decryptToken(null), null);
});

test('decryptToken returns null for undefined', () => {
  assert.equal(decryptToken(undefined), null);
});

test('decryptToken returns null when tag is tampered (authentication failure)', () => {
  const stored = encryptToken('original');
  const parts = stored.split('.');
  // Re-encode the tag with a known-corrupted byte (XOR first byte of the decoded tag)
  const fromB64url = (s) => {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (padded.length % 4)) % 4;
    return Buffer.from(padded + '='.repeat(pad), 'base64');
  };
  const toB64url = (buf) =>
    buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const tagBuf = fromB64url(parts[1]);
  tagBuf[0] ^= 0xff; // flip all bits in first byte
  const tamperedTag = toB64url(tagBuf);
  const tampered = `${parts[0]}.${tamperedTag}.${parts[2]}`;
  assert.equal(decryptToken(tampered), null);
});

test('decryptToken returns null when ciphertext is tampered', () => {
  const stored = encryptToken('original');
  const parts = stored.split('.');
  // Flip last char of cipher segment
  const lastChar = parts[2].slice(-1);
  const flipped = lastChar === 'A' ? 'B' : 'A';
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${flipped}`;
  assert.equal(decryptToken(tampered), null);
});

test('decryptToken returns null when only 2 segments provided', () => {
  assert.equal(decryptToken('seg1.seg2'), null);
});

test('decryptToken returns null when wrong key used', () => {
  const stored = encryptToken('my_token');
  // Temporarily change key
  process.env.TRAKT_TOKEN_KEY = 'f' + TEST_KEY.slice(1); // different key
  const result = decryptToken(stored);
  process.env.TRAKT_TOKEN_KEY = TEST_KEY; // restore
  assert.equal(result, null);
});

// ── buildWatchlistPayload ─────────────────────────────────────────────────────

test('buildWatchlistPayload: maps film items to movies array', () => {
  const result = buildWatchlistPayload([
    { tmdbId: 100, kind: 'film' },
    { tmdbId: 200, kind: 'film' },
  ]);
  assert.equal(result.movies.length, 2);
  assert.equal(result.shows.length, 0);
  assert.deepEqual(result.movies[0], { ids: { tmdb: 100 } });
  assert.deepEqual(result.movies[1], { ids: { tmdb: 200 } });
});

test('buildWatchlistPayload: maps tv items to shows array', () => {
  const result = buildWatchlistPayload([
    { tmdbId: 1399, kind: 'tv' },
  ]);
  assert.equal(result.shows.length, 1);
  assert.equal(result.movies.length, 0);
  assert.deepEqual(result.shows[0], { ids: { tmdb: 1399 } });
});

test('buildWatchlistPayload: mixed film and tv', () => {
  const items = [
    { tmdbId: 1, kind: 'film' },
    { tmdbId: 2, kind: 'tv' },
    { tmdbId: 3, kind: 'film' },
  ];
  const { movies, shows } = buildWatchlistPayload(items);
  assert.equal(movies.length, 2);
  assert.equal(shows.length, 1);
});

test('buildWatchlistPayload: drops non-integer tmdbId', () => {
  const items = [
    { tmdbId: 'abc', kind: 'film' },
    { tmdbId: NaN, kind: 'film' },
    { tmdbId: 3.5, kind: 'film' },
    { tmdbId: null, kind: 'film' },
    { tmdbId: 100, kind: 'film' }, // only valid one
  ];
  const { movies } = buildWatchlistPayload(items);
  assert.equal(movies.length, 1);
  assert.equal(movies[0].ids.tmdb, 100);
});

test('buildWatchlistPayload: drops zero/negative tmdbId', () => {
  const { movies } = buildWatchlistPayload([
    { tmdbId: 0, kind: 'film' },
    { tmdbId: -5, kind: 'film' },
  ]);
  assert.equal(movies.length, 0);
});

test('buildWatchlistPayload: caps at 500 items', () => {
  const items = Array.from({ length: 600 }, (_, i) => ({ tmdbId: i + 1, kind: 'film' }));
  const { movies } = buildWatchlistPayload(items);
  assert.equal(movies.length, 500);
});

test('buildWatchlistPayload: empty input returns empty arrays', () => {
  const { movies, shows } = buildWatchlistPayload([]);
  assert.equal(movies.length, 0);
  assert.equal(shows.length, 0);
});

test('buildWatchlistPayload: null input returns empty arrays', () => {
  const { movies, shows } = buildWatchlistPayload(null);
  assert.equal(movies.length, 0);
  assert.equal(shows.length, 0);
});

test('buildWatchlistPayload: unknown kind treated as film (movies)', () => {
  const { movies, shows } = buildWatchlistPayload([{ tmdbId: 1, kind: 'movie' }]);
  assert.equal(movies.length, 1);
  assert.equal(shows.length, 0);
});

// ── extractWatchedIds ─────────────────────────────────────────────────────────

test('extractWatchedIds: extracts movies correctly', () => {
  const moviesResp = [
    { movie: { ids: { tmdb: 27205 } }, last_watched_at: '2024-01-01T00:00:00.000Z' },
    { movie: { ids: { tmdb: 550 } }, last_watched_at: '2023-06-15T12:00:00.000Z' },
  ];
  const result = extractWatchedIds(moviesResp, []);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { tmdbId: 27205, kind: 'film', watchedAt: '2024-01-01T00:00:00.000Z' });
  assert.deepEqual(result[1], { tmdbId: 550, kind: 'film', watchedAt: '2023-06-15T12:00:00.000Z' });
});

test('extractWatchedIds: extracts shows correctly', () => {
  const showsResp = [
    { show: { ids: { tmdb: 1399 } }, last_watched_at: '2024-03-01T00:00:00.000Z' },
  ];
  const result = extractWatchedIds([], showsResp);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { tmdbId: 1399, kind: 'tv', watchedAt: '2024-03-01T00:00:00.000Z' });
});

test('extractWatchedIds: skips entries with missing tmdb id', () => {
  const moviesResp = [
    { movie: { ids: { imdb: 'tt0110912' } } }, // no tmdb
    { movie: { ids: { tmdb: 278 } }, last_watched_at: null },
  ];
  const result = extractWatchedIds(moviesResp, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 278);
});

test('extractWatchedIds: tolerates null/undefined entries (malformed)', () => {
  const moviesResp = [null, undefined, { movie: { ids: { tmdb: 100 } } }];
  const result = extractWatchedIds(moviesResp, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 100);
});

test('extractWatchedIds: tolerates non-integer tmdb ids', () => {
  const moviesResp = [
    { movie: { ids: { tmdb: 'not_a_number' } } },
    { movie: { ids: { tmdb: 0 } } },
    { movie: { ids: { tmdb: -1 } } },
    { movie: { ids: { tmdb: 42 } } },
  ];
  const result = extractWatchedIds(moviesResp, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 42);
});

test('extractWatchedIds: handles null last_watched_at → watchedAt null', () => {
  const moviesResp = [{ movie: { ids: { tmdb: 1 } } }]; // no last_watched_at key
  const result = extractWatchedIds(moviesResp, []);
  assert.equal(result[0].watchedAt, null);
});

test('extractWatchedIds: caps total at 2000', () => {
  const movies = Array.from({ length: 1500 }, (_, i) => ({
    movie: { ids: { tmdb: i + 1 } },
    last_watched_at: null,
  }));
  const shows = Array.from({ length: 1500 }, (_, i) => ({
    show: { ids: { tmdb: i + 10000 } },
    last_watched_at: null,
  }));
  const result = extractWatchedIds(movies, shows);
  assert.equal(result.length, 2000);
});

test('extractWatchedIds: non-array inputs produce empty result', () => {
  assert.equal(extractWatchedIds(null, null).length, 0);
  assert.equal(extractWatchedIds(undefined, undefined).length, 0);
  assert.equal(extractWatchedIds('bad', 'bad').length, 0);
});

// ── pollOutcome ───────────────────────────────────────────────────────────────

test('pollOutcome: 200 → ok', () => {
  assert.deepEqual(pollOutcome(200), { state: 'ok' });
});

test('pollOutcome: 400 → pending', () => {
  assert.deepEqual(pollOutcome(400), { state: 'pending' });
});

test('pollOutcome: 429 → slow_down', () => {
  assert.deepEqual(pollOutcome(429), { state: 'slow_down' });
});

test('pollOutcome: 410 → expired', () => {
  assert.deepEqual(pollOutcome(410), { state: 'expired' });
});

test('pollOutcome: 418 → denied', () => {
  assert.deepEqual(pollOutcome(418), { state: 'denied' });
});

test('pollOutcome: 404 → invalid', () => {
  assert.deepEqual(pollOutcome(404), { state: 'invalid' });
});

test('pollOutcome: 409 → invalid', () => {
  assert.deepEqual(pollOutcome(409), { state: 'invalid' });
});

test('pollOutcome: any other code → invalid', () => {
  assert.deepEqual(pollOutcome(500), { state: 'invalid' });
  assert.deepEqual(pollOutcome(401), { state: 'invalid' });
  assert.deepEqual(pollOutcome(0), { state: 'invalid' });
});

// ── traktHeaders ──────────────────────────────────────────────────────────────

test('traktHeaders: includes required static headers', () => {
  const h = traktHeaders('my_client_id');
  assert.equal(h['Content-Type'], 'application/json');
  assert.equal(h['trakt-api-version'], '2');
  assert.equal(h['trakt-api-key'], 'my_client_id');
});

test('traktHeaders: no Authorization header when accessToken is absent', () => {
  const h = traktHeaders('my_client_id');
  assert.equal(h['Authorization'], undefined);
});

test('traktHeaders: includes Authorization when accessToken provided', () => {
  const h = traktHeaders('my_client_id', 'my_access_token');
  assert.equal(h['Authorization'], 'Bearer my_access_token');
});

test('traktHeaders: trakt-api-version is the string "2" (not a number)', () => {
  const h = traktHeaders('any');
  assert.equal(typeof h['trakt-api-version'], 'string');
  assert.equal(h['trakt-api-version'], '2');
});

test('traktHeaders: trakt-api-key matches the provided clientId', () => {
  const h = traktHeaders('CLIENT_XYZ');
  assert.equal(h['trakt-api-key'], 'CLIENT_XYZ');
});

// ── needsRefresh ──────────────────────────────────────────────────────────────

const ONE_HOUR = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;

test('needsRefresh: returns false when token expires far in the future', () => {
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 24 * ONE_HOUR); // 30 days
  assert.equal(needsRefresh(expiresAt, now), false);
});

test('needsRefresh: returns true when exactly at the 24h boundary', () => {
  const now = Date.now();
  const expiresAt = new Date(now + TWENTY_FOUR_HOURS); // exactly 24h from now
  assert.equal(needsRefresh(expiresAt, now), true);
});

test('needsRefresh: returns true when 23h from expiry (inside window)', () => {
  const now = Date.now();
  const expiresAt = new Date(now + 23 * ONE_HOUR);
  assert.equal(needsRefresh(expiresAt, now), true);
});

test('needsRefresh: returns true when already expired', () => {
  const now = Date.now();
  const expiresAt = new Date(now - ONE_HOUR);
  assert.equal(needsRefresh(expiresAt, now), true);
});

test('needsRefresh: returns false when 25h from expiry (outside window)', () => {
  const now = Date.now();
  const expiresAt = new Date(now + 25 * ONE_HOUR);
  assert.equal(needsRefresh(expiresAt, now), false);
});

test('needsRefresh: accepts a date string', () => {
  const now = Date.now();
  const expiresAt = new Date(now + 25 * ONE_HOUR).toISOString();
  assert.equal(needsRefresh(expiresAt, now), false);
});

test('needsRefresh: accepts a timestamp number', () => {
  const now = Date.now();
  const expiresAt = now + 25 * ONE_HOUR;
  assert.equal(needsRefresh(expiresAt, now), false);
});

test('needsRefresh: uses Date.now() when nowMs is not provided', () => {
  // Token expiring in 1 year — should definitely not need refresh
  const expiresAt = new Date(Date.now() + 365 * 24 * ONE_HOUR);
  assert.equal(needsRefresh(expiresAt), false);
});

// Note: no env cleanup needed — the test process is isolated and exits after tests.
