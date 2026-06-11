/**
 * Unit tests for lib/hydrateQueue.js
 *
 * pickHydrationTargets: respects max / skips cached / skips has-watch /
 *   drops bad tmdbId / preserves order.
 *
 * createLimiter: caps concurrency / preserves result order /
 *   maps rejections to null / handles empty array.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickHydrationTargets, createLimiter } from '../lib/hydrateQueue.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function item(overrides) {
  return { tmdbId: 100, kind: 'film', title: 'Test', ...overrides };
}

/** Returns a deferred-promise pair { promise, resolve, reject }. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── pickHydrationTargets ──────────────────────────────────────────────────────

test('pickHydrationTargets: returns empty array for empty items', () => {
  const result = pickHydrationTargets([], new Set(), 12);
  assert.deepEqual(result, []);
});

test('pickHydrationTargets: returns up to max items', () => {
  const items = Array.from({ length: 20 }, (_, i) => item({ tmdbId: i + 1 }));
  const result = pickHydrationTargets(items, new Set(), 12);
  assert.equal(result.length, 12);
});

test('pickHydrationTargets: skips items already in cachedKeys', () => {
  const items = [
    item({ tmdbId: 1 }),
    item({ tmdbId: 2 }),
    item({ tmdbId: 3 }),
  ];
  const cached = new Set(['film:1', 'film:3']);
  const result = pickHydrationTargets(items, cached, 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 2);
});

test('pickHydrationTargets: skips items that already have a .watch value', () => {
  const items = [
    item({ tmdbId: 1, watch: { stream: [] } }),
    item({ tmdbId: 2 }),
    item({ tmdbId: 3, watch: null }),
  ];
  // watch: null is still a "has watch value" — truthy check is on !== undefined
  const result = pickHydrationTargets(items, new Set(), 12);
  // item 1 has watch (object), item 3 has watch (null which is != undefined)
  // only item 2 has no watch property
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 2);
});

test('pickHydrationTargets: drops items with non-integer tmdbId (string)', () => {
  const items = [
    item({ tmdbId: 'abc' }),
    item({ tmdbId: 42 }),
  ];
  const result = pickHydrationTargets(items, new Set(), 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 42);
});

test('pickHydrationTargets: drops items with NaN tmdbId', () => {
  const items = [
    item({ tmdbId: NaN }),
    item({ tmdbId: 5 }),
  ];
  const result = pickHydrationTargets(items, new Set(), 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 5);
});

test('pickHydrationTargets: drops items with null tmdbId', () => {
  const items = [
    item({ tmdbId: null }),
    item({ tmdbId: 7 }),
  ];
  const result = pickHydrationTargets(items, new Set(), 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 7);
});

test('pickHydrationTargets: drops items with float tmdbId', () => {
  const items = [
    item({ tmdbId: 1.5 }),
    item({ tmdbId: 8 }),
  ];
  const result = pickHydrationTargets(items, new Set(), 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 8);
});

test('pickHydrationTargets: preserves order of returned items', () => {
  const items = [
    item({ tmdbId: 10 }),
    item({ tmdbId: 20 }),
    item({ tmdbId: 30 }),
    item({ tmdbId: 40 }),
  ];
  const result = pickHydrationTargets(items, new Set(), 12);
  assert.deepEqual(result.map((i) => i.tmdbId), [10, 20, 30, 40]);
});

test('pickHydrationTargets: max of 0 returns empty array', () => {
  const items = [item({ tmdbId: 1 }), item({ tmdbId: 2 })];
  const result = pickHydrationTargets(items, new Set(), 0);
  assert.deepEqual(result, []);
});

test('pickHydrationTargets: does not mutate the original items', () => {
  const items = [item({ tmdbId: 1 }), item({ tmdbId: 2 })];
  const copy = items.map((i) => ({ ...i }));
  pickHydrationTargets(items, new Set(), 12);
  assert.deepEqual(items, copy);
});

test('pickHydrationTargets: cachedKey uses kind:tmdbId format', () => {
  const items = [
    item({ tmdbId: 99, kind: 'tv' }),
    item({ tmdbId: 99, kind: 'film' }),
  ];
  const cached = new Set(['tv:99']);
  const result = pickHydrationTargets(items, cached, 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'film');
});

test('pickHydrationTargets: skips when both cached and has-watch conditions apply', () => {
  const items = [
    item({ tmdbId: 1, watch: { stream: [] } }),   // has watch
    item({ tmdbId: 2 }),                           // in cache
    item({ tmdbId: 3 }),                           // eligible
  ];
  const cached = new Set(['film:2']);
  const result = pickHydrationTargets(items, cached, 12);
  assert.equal(result.length, 1);
  assert.equal(result[0].tmdbId, 3);
});

// ── createLimiter ─────────────────────────────────────────────────────────────

test('createLimiter: returns a function', () => {
  const limiter = createLimiter(4);
  assert.equal(typeof limiter, 'function');
});

test('createLimiter: handles empty task array', async () => {
  const run = createLimiter(4);
  const results = await run([]);
  assert.deepEqual(results, []);
});

test('createLimiter: resolves all successful tasks', async () => {
  const run = createLimiter(4);
  const tasks = [
    () => Promise.resolve('a'),
    () => Promise.resolve('b'),
    () => Promise.resolve('c'),
  ];
  const results = await run(tasks);
  assert.deepEqual(results, ['a', 'b', 'c']);
});

test('createLimiter: maps rejected tasks to null (never throws)', async () => {
  const run = createLimiter(4);
  const tasks = [
    () => Promise.resolve('ok'),
    () => Promise.reject(new Error('boom')),
    () => Promise.resolve('also ok'),
  ];
  const results = await run(tasks);
  assert.deepEqual(results, ['ok', null, 'also ok']);
});

test('createLimiter: preserves result order with concurrency=1', async () => {
  const run = createLimiter(1);
  const order = [];
  const tasks = [
    async () => { order.push(0); return 'zero'; },
    async () => { order.push(1); return 'one'; },
    async () => { order.push(2); return 'two'; },
  ];
  const results = await run(tasks);
  assert.deepEqual(results, ['zero', 'one', 'two']);
  assert.deepEqual(order, [0, 1, 2]);
});

test('createLimiter: caps concurrency — at most N tasks in flight at once', async () => {
  const concurrency = 2;
  const run = createLimiter(concurrency);

  let concurrent = 0;
  let maxConcurrent = 0;

  const defs = Array.from({ length: 5 }, () => deferred());
  const tasks = defs.map((d) => () => {
    concurrent++;
    if (concurrent > maxConcurrent) maxConcurrent = concurrent;
    return d.promise.then((v) => {
      concurrent--;
      return v;
    });
  });

  // Start run — don't await yet
  const runPromise = run(tasks);

  // Give the event loop one tick so the limiter starts the first batch
  await new Promise((r) => setImmediate(r));

  // Only `concurrency` tasks should be in flight at this point
  assert.equal(concurrent, concurrency);

  // Resolve all tasks in sequence
  for (let i = 0; i < defs.length; i++) {
    defs[i].resolve(i);
    await new Promise((r) => setImmediate(r));
  }

  const results = await runPromise;
  assert.deepEqual(results, [0, 1, 2, 3, 4]);
  assert.ok(maxConcurrent <= concurrency, `maxConcurrent=${maxConcurrent} exceeded concurrency=${concurrency}`);
});

test('createLimiter: concurrency=1 runs tasks sequentially', async () => {
  const run = createLimiter(1);
  let concurrent = 0;
  let violation = false;

  const defs = Array.from({ length: 3 }, () => deferred());
  const tasks = defs.map((d) => () => {
    concurrent++;
    if (concurrent > 1) violation = true;
    return d.promise.finally(() => { concurrent--; });
  });

  const runPromise = run(tasks);
  await new Promise((r) => setImmediate(r));

  for (const d of defs) {
    d.resolve('x');
    await new Promise((r) => setImmediate(r));
  }

  await runPromise;
  assert.ok(!violation, 'concurrency=1 had more than 1 task in flight');
});

test('createLimiter: all rejections map to null, run resolves', async () => {
  const run = createLimiter(2);
  const tasks = [
    () => Promise.reject(new Error('e1')),
    () => Promise.reject(new Error('e2')),
    () => Promise.reject(new Error('e3')),
  ];
  const results = await run(tasks);
  assert.deepEqual(results, [null, null, null]);
});

test('createLimiter: large batch with mixed results', async () => {
  const run = createLimiter(3);
  const tasks = Array.from({ length: 10 }, (_, i) =>
    i % 3 === 0
      ? () => Promise.reject(new Error(`fail-${i}`))
      : () => Promise.resolve(i)
  );
  const results = await run(tasks);
  const expected = Array.from({ length: 10 }, (_, i) => (i % 3 === 0 ? null : i));
  assert.deepEqual(results, expected);
});
