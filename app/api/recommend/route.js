import { logUsage } from '@/lib/usage.js';
import { cacheGetJSON, cacheSetJSON } from '@/lib/cache.js';
import { recCacheKey, buildDonePayload } from '@/lib/recCache.js';

// ── Whole-result cache ───────────────────────────────────────────────────────
// A search costs an LLM loop + web search + dozens of TMDB calls and takes
// 20–45s; identical queries (suggestion chips!) should be instant. ONLY
// unfiltered, anonymous, non-refine runs are cached — provider-filtered or
// per-user results must never leak across sessions.
const _recCache = new Map(); // key → { payload, expiresAt }
const REC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REC_CACHE_MAX = 200;

function cacheGet(key) {
  const hit = _recCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    _recCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload) {
  if (_recCache.size >= REC_CACHE_MAX) {
    const oldest = _recCache.keys().next().value;
    _recCache.delete(oldest);
  }
  _recCache.set(key, { payload, expiresAt: Date.now() + REC_CACHE_TTL_MS });
}

const MAX_QUERY_CHARS = 500;

/** Coerce and validate the prior body field. Returns undefined on any problem. */
function parsePrior(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  if (typeof raw.query !== 'string' || raw.query.length > 500) return undefined;
  if (!Array.isArray(raw.picks)) return undefined;
  const picks = raw.picks.slice(0, 12).map((x) => {
    if (!x || typeof x !== 'object') return null;
    return {
      id: String(x.id || '').slice(0, 32),
      title: String(x.title || '').slice(0, 200),
      year: Number.isInteger(x.year) ? x.year : undefined,
      kind: x.kind === 'tv' ? 'tv' : 'film',
    };
  }).filter(Boolean);
  return { query: raw.query, picks };
}

export async function POST(request) {
  const startedAt = Date.now();
  let query = '';
  let kind = 'all';
  let prior;

  try {
    const body = await request.json();
    query = (body.query || '').trim();
    kind = body.kind || 'all';
    // Strict coercion — never 500 on malformed prior.
    prior = parsePrior(body.prior);

    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Cap before anything expensive — queries go to an LLM and a web search.
    if (query.length > MAX_QUERY_CHARS) {
      return new Response(JSON.stringify({ error: `query too long (max ${MAX_QUERY_CHARS} chars)` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lazy import to keep the import inside the async context (server only)
  const { recommend } = await import('@/lib/agent.js');
  const { getSessionUser, rateLimited } = await import('@/lib/auth.js');
  const { providersFromQuery } = await import('@/lib/providers.js');
  const { db, dbAvailable } = await import('@/lib/db.js');

  // Each search fans out to LLM rounds + web search + TMDB — cap per IP.
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'local';
  if (rateLimited(`rec:${ip}`, { max: 10, windowMs: 5 * 60_000 })) {
    return new Response(
      JSON.stringify({ error: 'Easy there — a few searches a minute is plenty. Try again shortly.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Signed-in users with saved services get availability-aware results;
  // anonymous (or service-less) users are unaffected.
  const sessionUser = await getSessionUser(request);
  const services = sessionUser?.services || [];

  // Build the watchlist exclusion set for signed-in users (item 8).
  let excludeIds = new Set();
  if (sessionUser && dbAvailable()) {
    try {
      const pool = await db();
      const { rows } = await pool.query(
        'SELECT tmdb_id, kind FROM watchlist WHERE user_id = $1 LIMIT 500',
        [sessionUser.id],
      );
      excludeIds = new Set(rows.map((r) => `${r.kind}:${r.tmdb_id}`));
    } catch {
      // Non-fatal — search continues without exclusion.
    }
  }

  const filterActive = services.length > 0 || providersFromQuery(query).length > 0;
  // Bypass the whole-result cache when a per-user filter or refine context is
  // present — results would be incorrect or personalized.
  const bypassCache = filterActive || !!prior || excludeIds.size > 0;
  const cacheKey = recCacheKey(query, kind);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(obj) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        } catch {
          // Controller may be closed if client disconnected — ignore
        }
      }

      let ok = true;
      let picksCount = 0;
      let lang = null;
      let cached = false;
      try {
        const hit = !bypassCache && cacheGet(cacheKey);
        if (hit) {
          cached = true;
          picksCount = hit.picks?.length ?? 0;
          lang = hit.lang ?? null;
          emit(hit);
          return;
        }

        // L2: check Redis when there's no L1 hit.
        if (!bypassCache) {
          const l2 = await cacheGetJSON('natter:rec:v1:' + cacheKey);
          if (l2) {
            cached = true;
            picksCount = l2.picks?.length ?? 0;
            lang = l2.lang ?? null;
            cacheSet(cacheKey, l2);
            emit(l2);
            return;
          }
        }

        const result = await recommend({
          query,
          kind,
          services,
          prior,
          excludeIds,
          onStep: (label) => emit({ type: 'step', label }),
          onCandidates: (items) => emit({ type: 'candidates', items }),
          onPartial: ({ kind: k, intent, picks }) => emit({ type: 'partial', kind: k, intent, picks }),
        });

        picksCount = result.picks?.length ?? 0;
        lang = result.lang ?? null;
        const done = buildDonePayload(query, result);
        emit(done);
        if (!bypassCache && picksCount > 0) {
          cacheSet(cacheKey, done);
          cacheSetJSON('natter:rec:v1:' + cacheKey, done, 21600);
        }
      } catch (err) {
        ok = false;
        console.error('[/api/recommend]', err);
        emit({
          type: 'done',
          query,
          intent: '',
          picks: [],
          message: 'Something went wrong finding picks. Please try again.',
        });
      } finally {
        // One usage line per search — in finally so we capture it even on failure.
        logUsage({
          request,
          route: cached ? 'recommend-cached' : 'recommend',
          query,
          kind,
          lang,
          picksCount,
          ok,
          ms: Date.now() - startedAt,
        });
        // Record the search for trending chips — fire-and-forget, never awaited.
        // Only for real (non-cached) searches with results.
        if (!cached && ok && picksCount > 0 && dbAvailable()) {
          db().then((pool) => pool.query(
            'INSERT INTO searches (query, lang, country, picks_count, ok) VALUES ($1, $2, $3, $4, $5)',
            [query.slice(0, 200), lang, request.headers.get('cf-ipcountry') || null, picksCount, ok],
          )).catch(() => {});
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
