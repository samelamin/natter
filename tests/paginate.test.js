/**
 * Unit tests for lib/paginate.js — pure pagination + honest-depth helpers.
 * No network, no LLM. Shared by the agent (server) and the results UI (client),
 * so it must stay dependency-free.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chunk, shouldStopDeepening, PAGE_SIZE, CATEGORY_CAP } from '../lib/paginate.js';

test('PAGE_SIZE is 9, CATEGORY_CAP is 45', () => {
  assert.equal(PAGE_SIZE, 9);
  assert.equal(CATEGORY_CAP, 45);
});

test('chunk: splits into pages of the given size, last page is the remainder', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const pages = chunk(items, 9);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((p) => p.length), [9, 9, 2]);
  assert.deepEqual(pages[0], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(pages[2], [18, 19]);
});

test('chunk: exact multiple has no short trailing page', () => {
  const pages = chunk(Array.from({ length: 18 }, (_, i) => i), 9);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((p) => p.length), [9, 9]);
});

test('chunk: empty / nullish input → no pages', () => {
  assert.deepEqual(chunk([], 9), []);
  assert.deepEqual(chunk(undefined, 9), []);
  assert.deepEqual(chunk(null, 9), []);
});

test('chunk: defaults to PAGE_SIZE when size omitted', () => {
  assert.equal(chunk(Array.from({ length: 19 }, (_, i) => i)).length, 3); // 9,9,1
});

// ── Honest depth: when to stop deepening a category ──────────────────────────

test('shouldStopDeepening: stop once the target depth is reached', () => {
  assert.equal(shouldStopDeepening({ total: 45, added: 20, target: 45 }), true);
  assert.equal(shouldStopDeepening({ total: 46, added: 20, target: 45 }), true);
});

test('shouldStopDeepening: stop when a page adds too few NEW relevant titles', () => {
  // A near-dry genre: the latest discover page only yielded 2 new relevant titles.
  assert.equal(shouldStopDeepening({ total: 24, added: 2, target: 45 }), true);
});

test('shouldStopDeepening: keep going when the page added a healthy batch and target not met', () => {
  assert.equal(shouldStopDeepening({ total: 27, added: 9, target: 45 }), false);
});

test('shouldStopDeepening: minNew threshold is configurable', () => {
  assert.equal(shouldStopDeepening({ total: 10, added: 4, target: 45, minNew: 5 }), true);
  assert.equal(shouldStopDeepening({ total: 10, added: 4, target: 45, minNew: 3 }), false);
});
