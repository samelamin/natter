/**
 * Unit tests for the account/locale-free pure pieces:
 *   - lib/providers.js query parsing (the service-filter trigger)
 *   - lib/auth.js password hashing + cookie/session helpers + rate limiter
 * No network, no database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDERS, providerByKey, providersFromQuery } from '../lib/providers.js';
import {
  hashPassword,
  verifyPassword,
  sessionTokenFrom,
  sessionCookie,
  rateLimited,
  SESSION_COOKIE,
} from '../lib/auth.js';

// ── providersFromQuery ───────────────────────────────────────────────────────

test('providersFromQuery: "comedy on netflix" → Netflix', () => {
  const found = providersFromQuery('something funny on netflix');
  assert.deepEqual(found.map((p) => p.key), ['netflix']);
});

test('providersFromQuery: bare service names match ("disney film for the kids")', () => {
  assert.deepEqual(providersFromQuery('a disney film for the kids').map((p) => p.key), ['disney']);
  assert.deepEqual(providersFromQuery('whats good on prime').map((p) => p.key), ['prime']);
});

test('providersFromQuery: ambiguous words need an "on <service>" construction', () => {
  // "now" the word vs NOW the service
  assert.deepEqual(providersFromQuery('something to watch now'), []);
  assert.deepEqual(providersFromQuery('a thriller on now tv').map((p) => p.key), ['now']);
  // "sky" similar
  assert.deepEqual(providersFromQuery('a film about the sky'), []);
  assert.deepEqual(providersFromQuery('whats on sky tonight').map((p) => p.key), ['sky']);
});

test('providersFromQuery: plain genre queries trigger nothing', () => {
  assert.deepEqual(providersFromQuery('a feel good comedy'), []);
  assert.deepEqual(providersFromQuery('فيلم كوميدي'), []);
});

test('providers registry: keys resolve and tmdb ids are present', () => {
  for (const p of PROVIDERS) {
    assert.equal(providerByKey(p.key), p);
    assert.ok(Number.isInteger(p.tmdbId) && p.tmdbId > 0, `${p.key} needs a tmdb id`);
  }
  assert.equal(providerByKey('nonsense'), null);
});

// ── passwords ────────────────────────────────────────────────────────────────

test('hashPassword/verifyPassword: round trip', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('verifyPassword: malformed stored hashes are rejected, never throw', async () => {
  assert.equal(await verifyPassword('x', null), false);
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'bcrypt:aa:bb'), false);
  assert.equal(await verifyPassword('x', 'scrypt:zz'), false);
});

test('hashPassword: unique salt per call', async () => {
  const a = await hashPassword('same password');
  const b = await hashPassword('same password');
  assert.notEqual(a, b);
});

// ── session cookie helpers ───────────────────────────────────────────────────

test('sessionTokenFrom: parses the session cookie out of a header', () => {
  const request = {
    headers: new Headers({ cookie: `theme=dark; ${SESSION_COOKIE}=abc123; other=1` }),
  };
  assert.equal(sessionTokenFrom(request), 'abc123');
});

test('sessionTokenFrom: null when absent', () => {
  assert.equal(sessionTokenFrom({ headers: new Headers() }), null);
});

test('sessionCookie: sets httpOnly/SameSite and clears with Max-Age=0', () => {
  const set = sessionCookie('tok');
  assert.ok(set.includes(`${SESSION_COOKIE}=tok`));
  assert.ok(set.includes('HttpOnly'));
  assert.ok(set.includes('SameSite=Lax'));
  assert.ok(/Max-Age=\d{6,}/.test(set));
  const clear = sessionCookie(null);
  assert.ok(clear.includes('Max-Age=0'));
});

// ── rate limiter ─────────────────────────────────────────────────────────────

test('rateLimited: allows max events then blocks within the window', () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimited(key, { max: 3, windowMs: 60_000 }), false, `event ${i + 1} allowed`);
  }
  assert.equal(rateLimited(key, { max: 3, windowMs: 60_000 }), true, 'fourth event blocked');
});
