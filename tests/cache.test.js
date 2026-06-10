/**
 * Unit tests for lib/cache.js — Redis L2 cache.
 * Uses _setClientForTests / _resetForTests to inject fake clients.
 * NO live Redis connection — REDIS_URL is unset in the local env.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cacheAvailable,
  cacheGetJSON,
  cacheSetJSON,
  _setClientForTests,
  _resetForTests,
} from '../lib/cache.js';

import { _testCacheClear, tmdbSearch } from '../lib/tmdb.js';

// ── Helper: build a minimal in-memory fake Redis client ───────────────────

function makeFakeClient(opts = {}) {
  const store = new Map();

  return {
    _store: store,
    get: opts.get ?? ((key) => Promise.resolve(store.get(key) ?? null)),
    set: opts.set ?? ((key, value) => { store.set(key, value); return Promise.resolve('OK'); }),
  };
}

// ── 1. Without REDIS_URL ──────────────────────────────────────────────────

test('cacheAvailable: false when REDIS_URL is unset', () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  try {
    assert.equal(cacheAvailable(), false);
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
  }
});

test('cacheGetJSON: resolves null when no REDIS_URL (no client injected)', async () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  _resetForTests();
  try {
    const val = await cacheGetJSON('natter:test:absent');
    assert.equal(val, null);
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
    _resetForTests();
  }
});

test('cacheSetJSON: does not throw when no REDIS_URL (no client injected)', async () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  _resetForTests();
  try {
    // Should not throw — fire-and-forget, silently no-ops.
    cacheSetJSON('natter:test:noop', { x: 1 }, 60);
    // Await a tick to let any internal promise settle.
    await new Promise((r) => setImmediate(r));
  } finally {
    if (saved !== undefined) process.env.REDIS_URL = saved;
    _resetForTests();
  }
});

// ── 2. With an injected fake client ──────────────────────────────────────

test('cacheGetJSON / cacheSetJSON: round-trip a JSON object via fake client', async (t) => {
  const fake = makeFakeClient();
  _setClientForTests(fake);
  t.after(() => _resetForTests());

  const obj = { picks: [{ id: 'tmdb:1', title: 'Test' }], type: 'done' };
  cacheSetJSON('natter:rec:v1:testkey', obj, 3600);
  // Allow the async fire-and-forget to settle.
  await new Promise((r) => setImmediate(r));

  const result = await cacheGetJSON('natter:rec:v1:testkey');
  assert.deepEqual(result, obj);
});

test('cacheGetJSON: returns null for corrupted stored string', async (t) => {
  const fake = makeFakeClient();
  // Pre-corrupt the store with invalid JSON.
  fake._store.set('natter:bad:key', 'not-valid-json{{{');
  _setClientForTests(fake);
  t.after(() => _resetForTests());

  const result = await cacheGetJSON('natter:bad:key');
  assert.equal(result, null);
});

// ── 3. Timeout: get() never resolves ─────────────────────────────────────

test('cacheGetJSON: resolves null within timeoutMs when get() hangs', async (t) => {
  const fake = makeFakeClient({
    // Never resolves.
    get: () => new Promise(() => {}),
  });
  _setClientForTests(fake);
  t.after(() => _resetForTests());

  const start = Date.now();
  const result = await cacheGetJSON('natter:test:hang', { timeoutMs: 30 });
  const elapsed = Date.now() - start;

  assert.equal(result, null, 'Should return null on timeout');
  assert.ok(elapsed < 200, `Should resolve in <200ms, took ${elapsed}ms`);
});

// ── 4. set() error: does not throw / no unhandled rejection ──────────────

test('cacheSetJSON: does not throw or produce unhandled rejection when set() rejects', async (t) => {
  const fake = makeFakeClient({
    set: () => Promise.reject(new Error('write error')),
  });
  _setClientForTests(fake);
  t.after(() => _resetForTests());

  // Must not throw synchronously.
  cacheSetJSON('natter:test:errkey', { ok: true }, 60);
  // Await a tick for the async internals to settle.
  await new Promise((r) => setImmediate(r));
  // If we reach here without an uncaught rejection, the test passes.
});

// ── 5. TMDB read-through via injected fake + mocked fetch ─────────────────

test('tmdb read-through: populates fake Redis on first fetch, serves from it on second', async (t) => {
  // Temporarily set REDIS_URL so cacheAvailable() returns true inside tmdb.js.
  const savedUrl = process.env.REDIS_URL;
  process.env.REDIS_URL = 'redis://test';

  const fake = makeFakeClient();
  _setClientForTests(fake);
  _testCacheClear();

  const savedFetch = global.fetch;
  let fetchCallCount = 0;

  const FAKE_TMDB_RESPONSE = {
    id: 603,
    title: 'The Matrix',
    release_date: '1999-03-31',
    vote_average: 8.2,
    genre_ids: [28, 878],
    poster_path: '/matrix.jpg',
    backdrop_path: '/bg.jpg',
    overview: 'A computer hacker.',
    vote_count: 22000,
    results: [
      {
        id: 603,
        title: 'The Matrix',
        release_date: '1999-03-31',
        vote_average: 8.2,
        genre_ids: [28, 878],
        poster_path: '/matrix.jpg',
        backdrop_path: '/bg.jpg',
        overview: 'A computer hacker.',
        vote_count: 22000,
      },
    ],
  };

  global.fetch = async () => {
    fetchCallCount++;
    return { ok: true, status: 200, json: async () => FAKE_TMDB_RESPONSE };
  };

  t.after(() => {
    global.fetch = savedFetch;
    _resetForTests();
    _testCacheClear();
    if (savedUrl !== undefined) {
      process.env.REDIS_URL = savedUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  // First call: fetches upstream, populates both L1 (in-process) and L2 (fake Redis).
  await tmdbSearch({ title: 'The Matrix', kind: 'film' });
  assert.equal(fetchCallCount, 1, 'First call should hit upstream fetch');

  // Verify fake Redis received a set with a hashed key (not the raw URL).
  const storedKeys = [...fake._store.keys()];
  const tmdbKeys = storedKeys.filter((k) => k.startsWith('natter:tmdb:v1:'));
  assert.ok(tmdbKeys.length > 0, 'Fake Redis should have a natter:tmdb:v1: key');

  const key = tmdbKeys[0];
  // Key must NOT contain anything from the URL (api_key, domain, query string).
  assert.ok(!key.includes('api.themoviedb'), 'Key must not contain TMDB domain');
  assert.ok(!key.includes('api_key'), 'Key must not contain api_key');
  assert.ok(!key.includes('Matrix'), 'Key must not contain the query title');

  // Clear L1 (in-process) cache so the next call must use L2.
  _testCacheClear();

  // Second call: L1 miss → L2 hit via fake Redis → should NOT call fetch again.
  const countBeforeSecond = fetchCallCount;
  await tmdbSearch({ title: 'The Matrix', kind: 'film' });
  assert.equal(fetchCallCount, countBeforeSecond, 'Second call (after L1 clear) should be served from L2, not fetch');
});
