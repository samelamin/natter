/**
 * Unit tests for lib/pinPicks.js — pure logic, no React, no network.
 * Run: export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && node --test tests/pinPicks.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergePinnedPicks } from '../lib/pinPicks.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick(id, extra = {}) {
  return { id, title: `Title-${id}`, kind: 'film', match: 85, badge: 'Top pick', ...extra };
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((key) => deepFreeze(obj[key]));
  return obj;
}

// ── First-event path (empty pinnedIds) ───────────────────────────────────────

test('first call with empty pinnedIds returns incoming picks unchanged + sets pinnedIds + appendedCount 0', () => {
  const incoming = [pick('a'), pick('b'), pick('c')];
  deepFreeze(incoming);

  const result = mergePinnedPicks([], incoming, []);

  assert.deepStrictEqual(result.picks, incoming, 'picks should equal incoming');
  assert.deepStrictEqual(result.pinnedIds, ['a', 'b', 'c'], 'pinnedIds should be incoming ids');
  assert.equal(result.appendedCount, 0, 'appendedCount should be 0 on first-event path');
});

test('first call with null pinnedIds treats it as empty', () => {
  const incoming = [pick('x'), pick('y')];
  const result = mergePinnedPicks([], incoming, null);
  assert.deepStrictEqual(result.picks, incoming);
  assert.deepStrictEqual(result.pinnedIds, ['x', 'y']);
  assert.equal(result.appendedCount, 0);
});

test('first call with undefined pinnedIds treats it as empty', () => {
  const incoming = [pick('m'), pick('n')];
  const result = mergePinnedPicks([], incoming, undefined);
  assert.deepStrictEqual(result.picks, incoming);
  assert.deepStrictEqual(result.pinnedIds, ['m', 'n']);
  assert.equal(result.appendedCount, 0);
});

// ── Pinned order preserved ────────────────────────────────────────────────────

test('pinned items keep prev position when incoming reorders them', () => {
  const prev = [pick('a'), pick('b'), pick('c')];
  const pinnedIds = ['a', 'b', 'c'];
  // done event reorders: c first, then a, then b
  const incoming = [pick('c', { reason: 'Great!' }), pick('a', { reason: 'Also great' }), pick('b', { reason: 'Good' })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks[0].id, 'a', 'first slot stays a');
  assert.equal(result.picks[1].id, 'b', 'second slot stays b');
  assert.equal(result.picks[2].id, 'c', 'third slot stays c');
});

// ── match% and badge are protected from incoming override ────────────────────

test('pinned items keep prev match% and badge, not incoming values', () => {
  const prev = [pick('a', { match: 92, badge: 'Top pick' })];
  const pinnedIds = ['a'];
  const incoming = [pick('a', { match: 77, badge: 'Solid match', reason: 'Updated reason' })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks[0].match, 92, 'prev match must be preserved');
  assert.equal(result.picks[0].badge, 'Top pick', 'prev badge must be preserved');
});

test('pinned item with numeric 0 match keeps 0 not incoming', () => {
  const prev = [pick('a', { match: 0, badge: null })];
  const pinnedIds = ['a'];
  const incoming = [pick('a', { match: 50, badge: 'Good' })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks[0].match, 0, 'match 0 is a valid number and must be kept');
});

test('pinned item with null badge allows incoming badge (null means no prev badge)', () => {
  const prev = [pick('a', { match: 80, badge: null })];
  const pinnedIds = ['a'];
  const incoming = [pick('a', { match: 60, badge: 'New badge' })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks[0].badge, 'New badge', 'null prev.badge → accept incoming badge');
  assert.equal(result.picks[0].match, 80, 'match still preserved');
});

// ── Non-match/badge fields update from incoming ──────────────────────────────

test('non-match/badge fields (reason, watch, poster) update from incoming', () => {
  const prev = [pick('a', { reason: 'Old reason', watch: null, poster: '/old.jpg' })];
  const pinnedIds = ['a'];
  const incoming = [pick('a', { reason: 'New reason', watch: 'Netflix', poster: '/new.jpg', match: 80, badge: 'Top pick' })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks[0].reason, 'New reason', 'reason updates');
  assert.equal(result.picks[0].watch, 'Netflix', 'watch updates');
  assert.equal(result.picks[0].poster, '/new.jpg', 'poster updates');
});

// ── Pinned id missing from incoming stays unchanged ──────────────────────────

test('a pinned id missing from incoming stays in output unchanged', () => {
  const prev = [pick('a'), pick('b', { reason: 'Keep me' })];
  const pinnedIds = ['a', 'b'];
  const incoming = [pick('a', { reason: 'Updated' })]; // b dropped by server

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks.length, 2, 'both items still present');
  assert.equal(result.picks[0].id, 'a');
  assert.equal(result.picks[1].id, 'b');
  assert.equal(result.picks[1].reason, 'Keep me', 'b kept unchanged');
});

// ── New incoming ids append at the end ───────────────────────────────────────

test('new incoming ids append at end in incoming order; appendedCount correct; pinnedIds extended', () => {
  const prev = [pick('a'), pick('b')];
  const pinnedIds = ['a', 'b'];
  const incoming = [pick('b', { reason: 'Updated b' }), pick('a', { reason: 'Updated a' }), pick('c', { match: 60, badge: 'New' }), pick('d', { match: 55, badge: null })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  assert.equal(result.picks.length, 4, 'a, b + c, d appended');
  assert.equal(result.picks[0].id, 'a', 'a stays first');
  assert.equal(result.picks[1].id, 'b', 'b stays second');
  assert.equal(result.picks[2].id, 'c', 'c appended third');
  assert.equal(result.picks[3].id, 'd', 'd appended fourth');
  assert.equal(result.appendedCount, 2, 'appendedCount = 2');
  assert.deepStrictEqual(result.pinnedIds, ['a', 'b', 'c', 'd'], 'pinnedIds extended');
});

test('appended items keep their own match and badge values from incoming', () => {
  const prev = [pick('a')];
  const pinnedIds = ['a'];
  const incoming = [pick('a', { match: 90, badge: 'Top' }), pick('newbie', { match: 55, badge: 'Rising' })];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);

  const newItem = result.picks.find((p) => p.id === 'newbie');
  assert.equal(newItem.match, 55, 'appended item keeps own match');
  assert.equal(newItem.badge, 'Rising', 'appended item keeps own badge');
});

// ── Inputs not mutated ────────────────────────────────────────────────────────

test('inputs are not mutated (arrays and item objects)', () => {
  const prev = [pick('a', { reason: 'Old' })];
  const pinnedIds = ['a'];
  const incoming = [pick('a', { reason: 'New', match: 60, badge: 'X' })];

  deepFreeze(prev);
  deepFreeze(incoming);
  deepFreeze(pinnedIds);

  // Should not throw even with frozen inputs
  assert.doesNotThrow(() => mergePinnedPicks(prev, incoming, pinnedIds));
});

// ── Null/undefined array tolerance ───────────────────────────────────────────

test('null prevPicks treated as empty', () => {
  const incoming = [pick('a'), pick('b')];
  const result = mergePinnedPicks(null, incoming, []);
  assert.deepStrictEqual(result.picks, incoming);
  assert.equal(result.appendedCount, 0);
});

test('undefined prevPicks treated as empty', () => {
  const incoming = [pick('a')];
  const result = mergePinnedPicks(undefined, incoming, []);
  assert.deepStrictEqual(result.picks, incoming);
});

test('null incomingPicks treated as empty', () => {
  const prev = [pick('a')];
  const pinnedIds = ['a'];
  // No incoming: prev items stay, nothing appended
  const result = mergePinnedPicks(prev, null, pinnedIds);
  assert.equal(result.picks.length, 1, 'prev item kept');
  assert.equal(result.picks[0].id, 'a');
  assert.equal(result.appendedCount, 0);
});

test('undefined incomingPicks treated as empty', () => {
  const prev = [pick('a')];
  const pinnedIds = ['a'];
  const result = mergePinnedPicks(prev, undefined, pinnedIds);
  assert.equal(result.picks.length, 1);
});

test('all null inputs returns empty result', () => {
  const result = mergePinnedPicks(null, null, null);
  assert.deepStrictEqual(result.picks, []);
  assert.deepStrictEqual(result.pinnedIds, []);
  assert.equal(result.appendedCount, 0);
});

// ── Items lacking an id ───────────────────────────────────────────────────────

test('prev items lacking id kept as-is in place', () => {
  const noIdItem = { title: 'Mystery', kind: 'film', match: 70 }; // no id
  const prev = [noIdItem, pick('a')];
  const pinnedIds = [undefined, 'a']; // noIdItem had no id when first-pinned

  const incoming = [pick('a', { reason: 'Updated' })];

  // Should not throw; noIdItem stays
  assert.doesNotThrow(() => mergePinnedPicks(prev, incoming, pinnedIds));
  const result = mergePinnedPicks(prev, incoming, pinnedIds);
  assert.equal(result.picks.some((p) => p.title === 'Mystery'), true, 'id-less prev item kept');
});

test('incoming id-less items append at end (cannot be matched)', () => {
  const prev = [pick('a')];
  const pinnedIds = ['a'];
  const noIdIncoming = { title: 'Ghost', kind: 'film', match: 50 };
  const incoming = [pick('a', { reason: 'Updated' }), noIdIncoming];

  const result = mergePinnedPicks(prev, incoming, pinnedIds);
  assert.equal(result.picks.some((p) => p.title === 'Ghost'), true, 'id-less incoming appended');
  assert.equal(result.appendedCount, 1, 'appendedCount counts the id-less append');
});
