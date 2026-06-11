/**
 * lib/trakt.js — server-only Trakt API integration.
 * NEVER import from client code.
 *
 * Device-code OAuth flow, token encryption (AES-256-GCM), watchlist push,
 * and watched-history pull for the Natter × Trakt integration.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const TRAKT_BASE = 'https://api.trakt.tv';
const FETCH_TIMEOUT_MS = 10_000;

// ── Configuration ────────────────────────────────────────────────────────────

/** True when all three required env vars are present. */
export function traktConfigured() {
  return !!(
    process.env.TRAKT_CLIENT_ID &&
    process.env.TRAKT_CLIENT_SECRET &&
    process.env.TRAKT_TOKEN_KEY
  );
}

// ── Token encryption (AES-256-GCM) ───────────────────────────────────────────
// Stored format: <iv_b64url>.<tag_b64url>.<cipher_b64url>  (base64url segments)

function getEncKey() {
  const hex = process.env.TRAKT_TOKEN_KEY || '';
  if (hex.length !== 64) throw new Error('TRAKT_TOKEN_KEY must be 64 hex chars');
  return Buffer.from(hex, 'hex');
}

function toB64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(pad), 'base64');
}

/**
 * Encrypt a plain token string → 'iv.tag.cipher' (base64url segments).
 * Throws if TRAKT_TOKEN_KEY is misconfigured.
 */
export function encryptToken(plain) {
  const key = getEncKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${toB64url(iv)}.${toB64url(tag)}.${toB64url(encrypted)}`;
}

/**
 * Decrypt a stored token → plain string, or null on ANY failure
 * (tampered ciphertext, wrong format, wrong key, etc.).
 */
export function decryptToken(stored) {
  try {
    const parts = (stored || '').split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, cipherB64] = parts;
    const key = getEncKey();
    const iv = fromB64url(ivB64);
    const tag = fromB64url(tagB64);
    const cipherBuf = fromB64url(cipherB64);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

// ── Pure helpers (unit-tested, no network) ────────────────────────────────────

/**
 * Build a Trakt watchlist POST body from Natter watchlist items.
 * @param {Array<{tmdbId:number, kind:string}>} items
 * @returns {{movies:Array, shows:Array}}
 */
export function buildWatchlistPayload(items) {
  const movies = [];
  const shows = [];
  const capped = (items || []).slice(0, 500);
  for (const item of capped) {
    const id = Number(item?.tmdbId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const entry = { ids: { tmdb: id } };
    if (item.kind === 'tv') {
      shows.push(entry);
    } else {
      movies.push(entry);
    }
  }
  return { movies, shows };
}

/**
 * Extract watched IDs from Trakt's /sync/watched/movies and /sync/watched/shows responses.
 * Tolerates malformed entries. Caps total at 2000.
 * @param {Array} moviesResp  — array from GET /sync/watched/movies
 * @param {Array} showsResp   — array from GET /sync/watched/shows
 * @returns {Array<{tmdbId:number, kind:string, watchedAt:string|null}>}
 */
export function extractWatchedIds(moviesResp, showsResp) {
  const result = [];
  const movies = Array.isArray(moviesResp) ? moviesResp : [];
  const shows = Array.isArray(showsResp) ? showsResp : [];

  for (const entry of movies) {
    if (result.length >= 2000) break;
    try {
      const id = entry?.movie?.ids?.tmdb;
      if (!Number.isInteger(id) || id <= 0) continue;
      result.push({
        tmdbId: id,
        kind: 'film',
        watchedAt: entry?.last_watched_at || null,
      });
    } catch {
      // skip malformed
    }
  }

  for (const entry of shows) {
    if (result.length >= 2000) break;
    try {
      const id = entry?.show?.ids?.tmdb;
      if (!Number.isInteger(id) || id <= 0) continue;
      result.push({
        tmdbId: id,
        kind: 'tv',
        watchedAt: entry?.last_watched_at || null,
      });
    } catch {
      // skip malformed
    }
  }

  return result;
}

/**
 * Map a device-token polling HTTP status code to a state string.
 * 200 → ok; 400 → pending; 429 → slow_down; 410 → expired;
 * 418 → denied; 404/409/anything else → invalid.
 */
export function pollOutcome(httpStatus) {
  switch (httpStatus) {
    case 200: return { state: 'ok' };
    case 400: return { state: 'pending' };
    case 429: return { state: 'slow_down' };
    case 410: return { state: 'expired' };
    case 418: return { state: 'denied' };
    default:  return { state: 'invalid' };
  }
}

/**
 * Build the headers object required for Trakt API calls.
 * @param {string} clientId
 * @param {string|undefined} accessToken — when provided, adds Authorization header
 */
export function traktHeaders(clientId, accessToken) {
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * True when the token needs refreshing (within 24h of expiry or already expired).
 * @param {Date|string|number} expiresAt
 * @param {number} [nowMs] — defaults to Date.now()
 */
export function needsRefresh(expiresAt, nowMs) {
  const now = nowMs !== undefined ? nowMs : Date.now();
  const expMs = new Date(expiresAt).getTime();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  return now >= expMs - TWENTY_FOUR_HOURS;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Trakt request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function apiPost(path, body, headers) {
  const res = await withTimeout(
    fetch(`${TRAKT_BASE}${path}`, {
      method: 'POST',
      headers: headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    FETCH_TIMEOUT_MS,
  );
  return res;
}

export async function apiGet(path, headers) {
  const res = await withTimeout(
    fetch(`${TRAKT_BASE}${path}`, {
      method: 'GET',
      headers,
    }),
    FETCH_TIMEOUT_MS,
  );
  return res;
}

// ── Server flows ──────────────────────────────────────────────────────────────

/**
 * POST /oauth/device/code — start the device-code flow.
 * Returns {device_code, user_code, verification_url, expires_in, interval}.
 */
export async function startDeviceFlow() {
  const res = await apiPost('/oauth/device/code', {
    client_id: process.env.TRAKT_CLIENT_ID,
  });
  if (!res.ok) {
    const err = new Error(`Trakt device/code failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_url: data.verification_url,
    expires_in: data.expires_in,
    interval: data.interval,
  };
}

/**
 * POST /oauth/device/token — poll for token.
 * Returns the raw token payload on 200, or throws a tagged Error for other statuses.
 * The error.traktState field holds the pollOutcome state.
 */
export async function pollDeviceToken(deviceCode) {
  const res = await apiPost('/oauth/device/token', {
    code: deviceCode,
    client_id: process.env.TRAKT_CLIENT_ID,
    client_secret: process.env.TRAKT_CLIENT_SECRET,
  });
  const outcome = pollOutcome(res.status);
  if (outcome.state !== 'ok') {
    const err = new Error(`Trakt poll: ${outcome.state}`);
    err.traktState = outcome.state;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * GET /users/settings — return {user:{username}}.
 */
async function getTraktUsername(accessToken) {
  const res = await apiGet('/users/settings', traktHeaders(process.env.TRAKT_CLIENT_ID, accessToken));
  if (!res.ok) return null;
  const data = await res.json();
  return data?.user?.username || null;
}

// ── Token DB helpers ──────────────────────────────────────────────────────────

/**
 * Fetch and decrypt the user's Trakt tokens from the DB.
 * Returns {accessToken, refreshToken, expiresAt} or null if not connected.
 */
export async function getUserTokens(pool, userId) {
  try {
    const { rows } = await pool.query(
      'SELECT access_token, refresh_token, expires_at FROM trakt_tokens WHERE user_id = $1',
      [userId],
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const accessToken = decryptToken(row.access_token);
    const refreshToken = decryptToken(row.refresh_token);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken, expiresAt: row.expires_at };
  } catch {
    return null;
  }
}

/**
 * Upsert encrypted tokens for a user.
 * tokenPayload: {access_token, refresh_token, expires_in, created_at}
 */
export async function saveTokens(pool, userId, tokenPayload, traktUser) {
  const encAccess = encryptToken(tokenPayload.access_token);
  const encRefresh = encryptToken(tokenPayload.refresh_token);

  // expires_at = created_at (epoch seconds from Trakt) + expires_in seconds
  let expiresAt;
  if (tokenPayload.created_at && tokenPayload.expires_in) {
    expiresAt = new Date((tokenPayload.created_at + tokenPayload.expires_in) * 1000);
  } else {
    expiresAt = new Date(Date.now() + tokenPayload.expires_in * 1000);
  }

  await pool.query(
    `INSERT INTO trakt_tokens (user_id, access_token, refresh_token, expires_at, trakt_user, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at,
           trakt_user = EXCLUDED.trakt_user,
           updated_at = now()`,
    [userId, encAccess, encRefresh, expiresAt, traktUser || null],
  );
}

/**
 * Refresh an access token using the refresh token.
 * Returns the new token payload or throws.
 */
async function refreshAccessToken(refreshToken) {
  const res = await apiPost('/oauth/token', {
    refresh_token: refreshToken,
    client_id: process.env.TRAKT_CLIENT_ID,
    client_secret: process.env.TRAKT_CLIENT_SECRET,
    redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    grant_type: 'refresh_token',
  });
  if (!res.ok) {
    const err = new Error(`Trakt token refresh failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Ensure the user has a fresh access token, refreshing if within 24h of expiry.
 * Calls fn(accessToken) with a valid token.
 * On refresh failure: deletes the trakt_tokens row and returns null.
 * Returns null when the user is not connected.
 */
export async function withAccessToken(pool, userId, fn) {
  const tokens = await getUserTokens(pool, userId);
  if (!tokens) return null;

  let { accessToken, refreshToken, expiresAt } = tokens;

  if (needsRefresh(expiresAt)) {
    try {
      const newPayload = await refreshAccessToken(refreshToken);
      // Fetch current traktUser to preserve it
      const { rows } = await pool.query(
        'SELECT trakt_user FROM trakt_tokens WHERE user_id = $1',
        [userId],
      );
      const traktUser = rows[0]?.trakt_user || null;
      await saveTokens(pool, userId, newPayload, traktUser);
      accessToken = newPayload.access_token;
    } catch {
      // Refresh failed — disconnect the user
      await pool.query('DELETE FROM trakt_tokens WHERE user_id = $1', [userId]).catch(() => {});
      return null;
    }
  }

  return fn(accessToken);
}

/**
 * Push the user's unwatched Natter watchlist items to Trakt.
 */
export async function pushWatchlist(pool, userId, items) {
  return withAccessToken(pool, userId, async (accessToken) => {
    const payload = buildWatchlistPayload(items);
    const res = await apiPost(
      '/sync/watchlist',
      payload,
      traktHeaders(process.env.TRAKT_CLIENT_ID, accessToken),
    );
    if (!res.ok) {
      const err = new Error(`Trakt sync/watchlist failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
}

/**
 * Fetch watched movies+shows from Trakt and return extractWatchedIds result.
 */
export async function fetchWatched(pool, userId) {
  return withAccessToken(pool, userId, async (accessToken) => {
    const headers = traktHeaders(process.env.TRAKT_CLIENT_ID, accessToken);
    const [moviesRes, showsRes] = await Promise.all([
      apiGet('/sync/watched/movies', headers),
      apiGet('/sync/watched/shows', headers),
    ]);

    const movies = moviesRes.ok ? await moviesRes.json() : [];
    const shows = showsRes.ok ? await showsRes.json() : [];
    return extractWatchedIds(movies, shows);
  });
}
