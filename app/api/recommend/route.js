import { logUsage } from '@/lib/usage.js';

// ── Whole-result cache ───────────────────────────────────────────────────────
// A search costs an LLM loop + web search + dozens of TMDB calls and takes
// 20–45s; identical queries (suggestion chips!) should be instant. ONLY
// unfiltered, successful runs are cached — provider-filtered results are
// per-user and must never leak across sessions.
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

export async function POST(request) {
  const startedAt = Date.now();
  let query = '';
  let kind = 'all';

  try {
    const body = await request.json();
    query = (body.query || '').trim();
    kind = body.kind || 'all';

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

  const filterActive = services.length > 0 || providersFromQuery(query).length > 0;
  const cacheKey = `${query.toLowerCase()}|${kind}`;

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
        const hit = !filterActive && cacheGet(cacheKey);
        if (hit) {
          cached = true;
          picksCount = hit.picks?.length ?? 0;
          lang = hit.lang ?? null;
          emit(hit);
          return;
        }

        const result = await recommend({
          query,
          kind,
          services,
          onStep: (label) => emit({ type: 'step', label }),
          onCandidates: (items) => emit({ type: 'candidates', items }),
        });

        picksCount = result.picks?.length ?? 0;
        lang = result.lang ?? null;
        const done = {
          type: 'done',
          query,
          intent: result.intent,
          // What the wording asked for ('film'|'tv'|'all') — the client lands
          // the toggle here; the pool itself carries both types.
          kind: result.kind,
          // Display labels of any active streaming-service filter (for the
          // "Only what you can watch on …" note in the results header).
          providers: result.providers,
          lang: result.lang,
          picks: result.picks,
        };
        emit(done);
        if (!filterActive && picksCount > 0) cacheSet(cacheKey, done);
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
