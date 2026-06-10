import { logUsage } from '@/lib/usage.js';

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
  } catch {
    return new Response(JSON.stringify({ error: 'invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Lazy import to keep the import inside the async context (server only)
  const { recommend } = await import('@/lib/agent.js');

  const encoder = new TextEncoder();
  let controllerRef = null;

  const stream = new ReadableStream({
    async start(controller) {
      controllerRef = controller;

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
      try {
        const result = await recommend({
          query,
          kind,
          onStep: (label) => emit({ type: 'step', label }),
        });

        picksCount = result.picks?.length ?? 0;
        lang = result.lang ?? null;
        emit({
          type: 'done',
          query,
          intent: result.intent,
          // What the wording asked for ('film'|'tv'|'all') — the client lands
          // the toggle here; the pool itself carries both types.
          kind: result.kind,
          picks: result.picks,
        });
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
        logUsage({ request, route: 'recommend', query, kind, lang, picksCount, ok, ms: Date.now() - startedAt });
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
