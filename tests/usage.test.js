/**
 * Unit tests for lib/usage.js — per-request usage logging.
 * buildUsageLine is the pure, testable core; logUsage is the stdout wrapper
 * that must never throw (logging must not break a request).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildUsageLine, logUsage } from '../lib/usage.js';

// Fake a Next route-handler Request: only .headers (a Headers) is used.
function req(headers = {}) {
  return { headers: new Headers(headers) };
}

// ── buildUsageLine ───────────────────────────────────────────────────────────

test('buildUsageLine: full search line from Cloudflare headers', () => {
  const line = buildUsageLine({
    request: req({
      'cf-connecting-ip': '203.0.113.7',
      'cf-ipcountry': 'GB',
      'user-agent': 'Mozilla/5.0',
    }),
    route: 'recommend',
    query: 'cosy sci-fi like Arrival',
    kind: 'movie',
    picksCount: 6,
    ok: true,
    ms: 1234,
    now: '2026-06-10T12:00:00.000Z',
  });

  assert.deepEqual(line, {
    evt: 'usage',
    ts: '2026-06-10T12:00:00.000Z',
    route: 'recommend',
    query: 'cosy sci-fi like Arrival',
    kind: 'movie',
    picksCount: 6,
    ok: true,
    ip: '203.0.113.7',
    country: 'GB',
    ua: 'Mozilla/5.0',
    ms: 1234,
  });
});

test('buildUsageLine: evt marker is always "usage"', () => {
  assert.equal(buildUsageLine({ request: req(), route: 'title' }).evt, 'usage');
});

test('buildUsageLine: optional fields default to null, ok defaults true', () => {
  const line = buildUsageLine({ request: req(), route: 'transcribe' });
  assert.equal(line.query, null);
  assert.equal(line.kind, null);
  assert.equal(line.picksCount, null);
  assert.equal(line.ms, null);
  assert.equal(line.ip, null);
  assert.equal(line.country, null);
  assert.equal(line.ua, null);
  assert.equal(line.ok, true);
});

test('buildUsageLine: cf-connecting-ip wins over x-forwarded-for', () => {
  const line = buildUsageLine({
    request: req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }),
    route: 'recommend',
  });
  assert.equal(line.ip, '203.0.113.7');
});

test('buildUsageLine: ip falls back to first X-Forwarded-For hop', () => {
  const line = buildUsageLine({
    request: req({ 'x-forwarded-for': '198.51.100.9, 70.41.3.18, 150.172.238.178' }),
    route: 'recommend',
  });
  assert.equal(line.ip, '198.51.100.9');
});

test('buildUsageLine: ip falls back to x-real-ip when no CF or XFF', () => {
  const line = buildUsageLine({
    request: req({ 'x-real-ip': '192.0.2.44' }),
    route: 'recommend',
  });
  assert.equal(line.ip, '192.0.2.44');
});

test('buildUsageLine: ok:false is preserved', () => {
  assert.equal(buildUsageLine({ request: req(), route: 'recommend', ok: false }).ok, false);
});

// ── logUsage ─────────────────────────────────────────────────────────────────

test('logUsage: emits a single-line JSON string parseable by Loki | json', () => {
  const original = console.log;
  let logged = null;
  console.log = (s) => { logged = s; };
  try {
    logUsage({
      request: req({ 'cf-ipcountry': 'US' }),
      route: 'recommend',
      query: 'heist movies',
      now: '2026-06-10T12:00:00.000Z',
    });
  } finally {
    console.log = original;
  }
  assert.equal(typeof logged, 'string');
  assert.ok(!logged.includes('\n'), 'must be a single line');
  const parsed = JSON.parse(logged);
  assert.equal(parsed.evt, 'usage');
  assert.equal(parsed.country, 'US');
  assert.equal(parsed.query, 'heist movies');
});

test('logUsage: never throws on a malformed request', () => {
  const original = console.log;
  console.log = () => {};
  try {
    assert.doesNotThrow(() =>
      logUsage({ request: { headers: null }, route: 'recommend', query: 'x' }),
    );
  } finally {
    console.log = original;
  }
});
