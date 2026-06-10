/**
 * lib/trending.js — server-only trending chip logic.
 * NEVER import from client-side code.
 */

import OpenAI from 'openai';
import { db, dbAvailable } from './db.js';

let _client;
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
    });
  }
  return _client;
}
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2';

const CHIPS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Guard: one refresh per locale at a time
const _inFlight = new Set();

function resolveLocale(country) {
  if (typeof country === 'string' && /^[A-Z]{2}$/.test(country)) return country;
  return 'GLOBAL';
}

/** Raw SQL aggregate — top queries for a locale over last 14 days. */
async function rawAggregate(pool, locale, limit = 8) {
  if (locale === 'GLOBAL') {
    const { rows } = await pool.query(
      `SELECT min(query) AS query, count(*) AS c, max(created_at) AS latest
       FROM searches
       WHERE created_at > now() - interval '14 days'
         AND ok
         AND picks_count >= 5
         AND length(query) BETWEEN 3 AND 80
       GROUP BY lower(trim(query))
       HAVING count(*) >= 2
       ORDER BY c DESC, latest DESC
       LIMIT $1`,
      [limit],
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT min(query) AS query, count(*) AS c, max(created_at) AS latest
     FROM searches
     WHERE created_at > now() - interval '14 days'
       AND ok
       AND picks_count >= 5
       AND length(query) BETWEEN 3 AND 80
       AND (country = $1)
     GROUP BY lower(trim(query))
     HAVING count(*) >= 2
     ORDER BY c DESC, latest DESC
     LIMIT $2`,
    [locale, limit],
  );
  return rows;
}

/** Top-up country results from GLOBAL when country yields < 4 rows. */
async function getChipsRaw(pool, locale) {
  const rows = await rawAggregate(pool, locale, 8);
  if (locale !== 'GLOBAL' && rows.length < 4) {
    const globalRows = await rawAggregate(pool, 'GLOBAL', 8);
    const seen = new Set(rows.map((r) => r.query.toLowerCase().trim()));
    for (const r of globalRows) {
      if (!seen.has(r.query.toLowerCase().trim())) {
        rows.push(r);
        seen.add(r.query.toLowerCase().trim());
      }
      if (rows.length >= 8) break;
    }
  }
  return rows.map((r) => r.query);
}

/**
 * Pure helper — validates LLM output against the original input queries.
 * Exported for tests.
 * @param {string[]} rawQueries — the queries passed to the LLM
 * @param {{ chips?: unknown }} llmOutput — parsed JSON from the LLM
 * @returns {string[] | null} — valid chips array or null
 */
export function validateCurated(rawQueries, llmOutput) {
  if (!llmOutput || !Array.isArray(llmOutput.chips)) return null;
  const inputSet = new Set(rawQueries.map((q) => q.trim()));
  const valid = [];
  const seen = new Set();
  for (const chip of llmOutput.chips) {
    if (typeof chip !== 'string') continue;
    const trimmed = chip.trim();
    if (trimmed.length < 3 || trimmed.length > 80) continue;
    if (!inputSet.has(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    valid.push(trimmed);
    if (valid.length >= 8) break;
  }
  if (valid.length < 3) return null;
  return valid;
}

async function refreshTrending(locale) {
  if (_inFlight.has(locale)) return;
  _inFlight.add(locale);
  try {
    const pool = await db();
    const rows = await rawAggregate(pool, locale, 40);
    if (rows.length < 4) return;

    const inputList = rows.map((r) => ({ query: r.query, count: Number(r.c) }));
    const inputQueries = rows.map((r) => r.query);

    const TIMEOUT_MS = 15_000;
    const completion = getClient()
      .chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You curate search-suggestion chips for a film/TV recommendation app. From the user-submitted search queries below (with counts), select up to 8 that are mutually DISTINCT in intent — multiple phrasings of the same ask (e.g. "comedy movie", "a funny comedy film") count as ONE; keep only the most popular phrasing. Prefer variety across genres, moods, languages and film/TV. Drop anything offensive, spammy, nonsensical, or containing personal information. Reply with STRICT JSON only: {"chips":["..."]} using EXACT strings from the list — never invent or rewrite.',
          },
          {
            role: 'user',
            content: JSON.stringify(inputList),
          },
        ],
      })
      .catch(() => null);

    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    });

    const resp = await Promise.race([completion, timeoutPromise]).catch(() => null);
    clearTimeout(timer);

    if (!resp) return;

    const raw = resp.choices?.[0]?.message?.content || '';
    // Strip markdown fences, find first {...} block
    const match = raw.replace(/```[a-z]*\n?/gi, '').match(/\{[\s\S]*\}/);
    if (!match) return;

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      console.warn('[trending] refresh: malformed JSON from LLM');
      return;
    }

    const chips = validateCurated(inputQueries, parsed);
    if (!chips) {
      console.warn('[trending] refresh: validation failed for locale', locale);
      return;
    }

    await pool.query(
      `INSERT INTO trending_chips (locale, chips, refreshed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (locale) DO UPDATE SET chips = $2, refreshed_at = now()`,
      [locale, JSON.stringify(chips)],
    );
  } catch (err) {
    console.warn('[trending] refresh error for locale', locale, err?.message);
  } finally {
    _inFlight.delete(locale);
  }
}

/**
 * Get trending chips for a locale.
 * @param {string | null | undefined} country — 2-letter country code (e.g. 'GB')
 * @returns {{ chips: string[], source: 'curated' | 'raw' }}
 */
export async function getTrendingChips(country) {
  const locale = resolveLocale(country);
  const pool = await db();

  // Check cache
  const { rows: cached } = await pool.query(
    'SELECT chips, refreshed_at FROM trending_chips WHERE locale = $1',
    [locale],
  );

  if (cached.length > 0) {
    const { chips, refreshed_at } = cached[0];
    const age = Date.now() - new Date(refreshed_at).getTime();
    if (age < CHIPS_TTL_MS) {
      return { chips: Array.isArray(chips) ? chips : JSON.parse(chips), source: 'curated' };
    }
    // Stale — return raw immediately, refresh async
    const rawChips = await getChipsRaw(pool, locale).catch(() => []);
    refreshTrending(locale); // fire-and-forget
    return { chips: rawChips, source: 'raw' };
  }

  // Missing — return raw immediately, refresh async
  const rawChips = await getChipsRaw(pool, locale).catch(() => []);
  refreshTrending(locale); // fire-and-forget
  return { chips: rawChips, source: 'raw' };
}
