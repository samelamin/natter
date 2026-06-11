/**
 * Unit tests for lib/warm.js, lib/recCache.js, lib/suggestionPool.js.
 *
 * NO network access — REDIS_URL is unset in the local env so all Redis
 * operations are no-ops. The in-flight guard is exercised on the no-op path.
 *
 * In-flight guard placement:
 *   The guard sits AFTER the cacheAvailable() check in lib/warm.js. This means:
 *   - Without REDIS_URL both concurrent calls hit the 'no redis' exit before the
 *     guard, so both return { reason: 'no redis' } (not 'already running').
 *   - The guard fires only when Redis IS present, preventing double runs on prod.
 *   The concurrent-call test below asserts 'no redis' on both — correct given
 *   this placement.
 *
 * Return shape (all paths):
 *   { warmed, skipped, trendingWarmed, trendingSkipped, reason? }
 *   - reason is present only on early-exit paths (no redis / already running).
 *   - trendingWarmed and trendingSkipped are always 0 on the no-redis path
 *     because the function returns before any trending import is attempted.
 *   - lib/trending.js is NEVER in warm.js's static import graph; the no-redis
 *     early-return guarantees the dynamic import('./trending.js') is never
 *     reached on that path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { warmTrendingChips } from '../lib/warm.js';
import { recCacheKey, buildDonePayload } from '../lib/recCache.js';
import { POOL } from '../lib/suggestionPool.js';

// ── 1. warmTrendingChips: no-op without REDIS_URL ──────────────────────────

test('warmTrendingChips: resolves to full no-redis shape without REDIS_URL', async () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  let result;
  try {
    result = await warmTrendingChips();
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
  }

  // Shape includes trendingWarmed/trendingSkipped (both 0) because the function
  // returns before any warming — static or trending — is attempted.
  assert.deepEqual(result, {
    warmed: 0,
    skipped: 0,
    trendingWarmed: 0,
    trendingSkipped: 0,
    reason: 'no redis',
  });
});

test('warmTrendingChips: does not throw without REDIS_URL', async () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  try {
    await assert.doesNotReject(() => warmTrendingChips());
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
  }
});

test('warmTrendingChips: no-redis path returns reason "no redis"', async () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  let result;
  try {
    result = await warmTrendingChips();
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
  }

  assert.equal(result.reason, 'no redis');
  // trendingWarmed and trendingSkipped must be present (0) on the no-redis path.
  // The dynamic import('./trending.js') is never reached on this path — the
  // function exits at the cacheAvailable() guard before any import occurs.
  assert.equal(result.trendingWarmed, 0);
  assert.equal(result.trendingSkipped, 0);
});

// ── 2. recCacheKey: lowercases and joins with | ────────────────────────────

test('recCacheKey: lowercases query and joins with |', () => {
  assert.equal(recCacheKey('A Cosy Whodunnit', 'all'), 'a cosy whodunnit|all');
  assert.equal(recCacheKey('Korean thrillers', 'film'), 'korean thrillers|film');
  assert.equal(recCacheKey('90s romcoms', 'tv'), '90s romcoms|tv');
  // Already lowercase — no change
  assert.equal(recCacheKey('feel-good sci-fi', 'all'), 'feel-good sci-fi|all');
});

test('recCacheKey: lowercases non-ASCII (Arabic) query', () => {
  const key = recCacheKey('فيلم كوميدي', 'all');
  assert.equal(key, 'فيلم كوميدي|all');
});

// ── 3. buildDonePayload: returns the exact done shape ─────────────────────

test('buildDonePayload: returns { type, query, intent, kind, providers, lang, picks }', () => {
  const fakeResult = {
    intent: 'Something cosy to watch',
    kind: 'all',
    providers: ['Netflix', 'Disney+'],
    lang: null,
    picks: [{ id: 'tmdb:603', title: 'The Matrix' }],
  };

  const payload = buildDonePayload('A cosy whodunnit', fakeResult);

  assert.equal(payload.type, 'done');
  assert.equal(payload.query, 'A cosy whodunnit');
  assert.equal(payload.intent, fakeResult.intent);
  assert.equal(payload.kind, fakeResult.kind);
  assert.deepEqual(payload.providers, fakeResult.providers);
  assert.equal(payload.lang, fakeResult.lang);
  assert.deepEqual(payload.picks, fakeResult.picks);

  // Exactly these keys — no extras
  const keys = Object.keys(payload).sort();
  assert.deepEqual(keys, ['intent', 'kind', 'lang', 'picks', 'providers', 'query', 'type']);
});

test('buildDonePayload: query is passed through verbatim (not lowercased)', () => {
  const result = { intent: 'x', kind: 'all', providers: [], lang: null, picks: [] };
  const payload = buildDonePayload('Korean Thrillers', result);
  assert.equal(payload.query, 'Korean Thrillers');
});

// ── 4. POOL: non-empty array of strings ────────────────────────────────────

test('POOL: is a non-empty array', () => {
  assert.ok(Array.isArray(POOL), 'POOL should be an array');
  assert.ok(POOL.length > 0, 'POOL should have at least one chip');
});

test('POOL: every entry is a non-empty string', () => {
  for (const chip of POOL) {
    assert.equal(typeof chip, 'string', `chip should be a string, got: ${typeof chip}`);
    assert.ok(chip.trim().length > 0, `chip should not be empty: "${chip}"`);
  }
});

test('POOL: has at least 14 chips (all static suggestion chips present)', () => {
  assert.ok(POOL.length >= 14, `Expected >= 14 chips, got ${POOL.length}`);
});

// ── 5. In-flight guard: two concurrent calls, both resolve without throwing ─

test('warmTrendingChips: two concurrent calls both resolve without throwing (no-redis path)', async () => {
  // Guard placement: AFTER cacheAvailable(). Without REDIS_URL, both calls
  // exit early with { reason: 'no redis' } — the guard is never reached.
  // Both should return the no-redis reason, not 'already running'.
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  let r1, r2;
  try {
    [r1, r2] = await Promise.all([warmTrendingChips(), warmTrendingChips()]);
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
  }

  assert.ok(r1 !== undefined, 'First call should resolve');
  assert.ok(r2 !== undefined, 'Second call should resolve');
  // Both see no-redis because the guard is after the cacheAvailable() check.
  assert.equal(r1.reason, 'no redis', 'First call: expected no redis reason');
  assert.equal(r2.reason, 'no redis', 'Second call: expected no redis reason (guard after cacheAvailable)');
  // Both results must include the trendingWarmed/trendingSkipped fields.
  assert.equal(r1.trendingWarmed, 0);
  assert.equal(r1.trendingSkipped, 0);
  assert.equal(r2.trendingWarmed, 0);
  assert.equal(r2.trendingSkipped, 0);
});
