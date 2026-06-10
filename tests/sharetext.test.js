/**
 * Unit tests for lib/sharetext.js — pure share-text helpers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shareTextFor, buildTargets } from '../lib/sharetext.js';

// ── shareTextFor ─────────────────────────────────────────────────────────────

test('shareTextFor: includes title, year in parens, and found-on Natter', () => {
  const text = shareTextFor({ title: 'Dune: Part Two', year: 2024 });
  assert.ok(text.includes('Dune: Part Two'), 'should include title');
  assert.ok(text.includes('(2024)'), 'should include year in parens');
  assert.ok(text.includes('— found on Natter.'), 'should include found-on Natter');
});

test('shareTextFor: appends reason slice (<=90 chars)', () => {
  const reason = 'A spectacular sci-fi epic that delivers on every promise of the first film with incredible visuals and a strong cast';
  const text = shareTextFor({ title: 'Dune: Part Two', year: 2024, reason });
  assert.ok(text.includes('— found on Natter.'), 'should have found-on separator');
  const slice = String(reason).slice(0, 90);
  assert.ok(text.includes(slice), 'should include up to 90 chars of reason');
  assert.ok(!text.includes(reason.slice(90)), 'should not include chars beyond 90');
});

test('shareTextFor: omits year parens when year is missing', () => {
  const text = shareTextFor({ title: 'Dune: Part Two' });
  assert.ok(!text.includes('('), 'should have no opening paren');
  assert.ok(text.includes('Dune: Part Two'), 'should still include title');
});

test('shareTextFor: omits reason segment when absent', () => {
  const text = shareTextFor({ title: 'Dune: Part Two', year: 2024 });
  // ends with '— found on Natter.' with no trailing space or reason text
  assert.ok(text.endsWith('— found on Natter.'), 'should end at Natter.');
});

test('shareTextFor: returns "Found on Natter." for empty object', () => {
  const text = shareTextFor({});
  assert.equal(text, 'Found on Natter.');
});

test('shareTextFor: does not throw for null fields', () => {
  assert.doesNotThrow(() => shareTextFor({ title: null, year: null, reason: null }));
  assert.doesNotThrow(() => shareTextFor(null));
  const t1 = shareTextFor({ title: null });
  assert.equal(t1, 'Found on Natter.');
});

// ── buildTargets ──────────────────────────────────────────────────────────────

test('buildTargets: WhatsApp link contains both text and url encoded', () => {
  const text = 'Dune: Part Two (2024) — found on Natter.';
  const url = 'https://natter.cc/title/film/693134';
  const { whatsapp } = buildTargets({ url, text });
  assert.ok(whatsapp.startsWith('https://wa.me/?text='), 'should be wa.me link');
  const decoded = decodeURIComponent(whatsapp.replace('https://wa.me/?text=', ''));
  assert.ok(decoded.includes(text), 'decoded should include text');
  assert.ok(decoded.includes(url), 'decoded should include url');
});

test('buildTargets: X link has url ONLY in &url= param (not in text param)', () => {
  const text = 'Dune: Part Two (2024) — found on Natter.';
  const url = 'https://natter.cc/title/film/693134';
  const { x } = buildTargets({ url, text });
  assert.ok(x.includes('x.com/intent/tweet'), 'should be x.com tweet intent');
  const xUrl = new URL(x);
  const tParam = xUrl.searchParams.get('text');
  const uParam = xUrl.searchParams.get('url');
  assert.ok(!tParam.includes(url), 'text param should not contain url');
  assert.ok(uParam === url, 'url param should equal url');
});

test('buildTargets: Facebook link is sharer.php form with encoded u', () => {
  const url = 'https://natter.cc/title/film/693134';
  const { facebook } = buildTargets({ url, text: 'anything' });
  assert.ok(facebook.includes('facebook.com/sharer/sharer.php'), 'should be Facebook sharer');
  assert.ok(facebook.includes(encodeURIComponent(url)), 'should include encoded url');
});

test('buildTargets: tolerates empty url and text without throwing', () => {
  assert.doesNotThrow(() => buildTargets({ url: '', text: '' }));
  const targets = buildTargets({ url: '', text: '' });
  assert.ok(typeof targets.whatsapp === 'string');
  assert.ok(typeof targets.x === 'string');
  assert.ok(typeof targets.facebook === 'string');
});
