/**
 * lib/cache.js — server-only Redis L2 cache.
 * NEVER import from client code.
 *
 * Degrades gracefully: when REDIS_URL is unset or Redis is unreachable,
 * every operation is a silent no-op and callers get null back. A Redis
 * problem must never slow or break a request beyond the pinned timeouts.
 */

import { createClient } from 'redis';

// ── Availability check ─────────────────────────────────────────────────────

export function cacheAvailable() {
  return !!process.env.REDIS_URL;
}

// ── Lazy client + connection state ────────────────────────────────────────

// Seam for unit tests — injected via _setClientForTests().
let _injectedClient = null;

let _client = null;
let _connectPromise = null;  // single shared connect promise
let _connected = false;
let _cooldownUntil = 0;      // epoch ms — skip attempts during cooldown
let _errorLogged = false;    // log once per process

const COOLDOWN_MS = 60_000;

function makeClient() {
  const c = createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 1500,
      reconnectStrategy: (retries) =>
        retries > 5 ? false : Math.min(retries * 200, 1000),
    },
  });
  c.on('error', (err) => {
    if (!_errorLogged) {
      console.error('[cache] redis error:', err.message || err);
      _errorLogged = true;
    }
  });
  return c;
}

/**
 * Return the active client (real or injected), or null if unavailable.
 * Initiates connection on first call; subsequent callers share the same
 * promise so we never double-connect.
 */
async function getClient() {
  if (_injectedClient) return _injectedClient;
  if (!cacheAvailable()) return null;
  if (Date.now() < _cooldownUntil) return null;

  if (_connected && _client) return _client;

  if (!_client) {
    _client = makeClient();
  }

  if (!_connectPromise) {
    _connectPromise = _client.connect().then(() => {
      _connected = true;
    }).catch((err) => {
      if (!_errorLogged) {
        console.error('[cache] redis error:', err.message || err);
        _errorLogged = true;
      }
      _connected = false;
      _client = null;
      _connectPromise = null;
      _cooldownUntil = Date.now() + COOLDOWN_MS;
    });
  }

  await _connectPromise;
  return _connected ? _client : null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Read a JSON value from Redis.
 * Returns the parsed value, or null on any problem (missing key, timeout,
 * parse error, connection issues). NEVER throws.
 * @param {string} key
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function cacheGetJSON(key, { timeoutMs = 250 } = {}) {
  try {
    // The ENTIRE operation — including a first-call connect — races the
    // timeout, so a slow/down Redis can never stall a request past timeoutMs.
    // A losing connect keeps running in the background and serves later calls.
    let timeoutHandle;
    const timeoutPromise = new Promise((resolve) => {
      timeoutHandle = setTimeout(() => resolve('__timeout__'), timeoutMs);
    });

    let raw;
    try {
      raw = await Promise.race([
        (async () => {
          const client = await getClient();
          if (!client) return null;
          return client.get(key).catch(() => null);
        })(),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (raw === '__timeout__' || raw == null) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Write a JSON value to Redis. Fire-and-forget — returns void; the caller
 * must not await this. Silently no-ops when Redis is unavailable. NEVER throws.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
export function cacheSetJSON(key, value, ttlSeconds) {
  // Deliberately not async — fire-and-forget. We return a promise that
  // the caller ignores; errors are swallowed by .catch.
  getClient().then((client) => {
    if (!client) return;
    client.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch(() => {});
  }).catch(() => {});
}

// ── Test seam ─────────────────────────────────────────────────────────────

/**
 * Inject a fake client for unit tests. The fake needs:
 *   get(key)  → Promise<string|null>
 *   set(key, value, opts) → Promise<any>
 * (connect and on are not required — the injected client bypasses connection
 * management entirely.)
 * @param {object} fakeClient
 */
export function _setClientForTests(fakeClient) {
  _injectedClient = fakeClient;
}

/**
 * Remove the injected test client and reset all connection state.
 * Call in t.after() to avoid cross-test pollution.
 */
export function _resetForTests() {
  _injectedClient = null;
  _client = null;
  _connectPromise = null;
  _connected = false;
  _cooldownUntil = 0;
  _errorLogged = false;
}
