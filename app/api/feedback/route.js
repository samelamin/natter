import { db, dbAvailable } from '@/lib/db.js';
import { rateLimited } from '@/lib/auth.js';
import { insertFeedback, sanitizeFeedbackSubmission, clientIp } from '@/lib/feedback.js';
import { logUsage } from '@/lib/usage.js';

export async function POST(request) {
  const startedAt = Date.now();
  let category = null;
  let ok = false;

  try {
    if (!dbAvailable()) {
      return Response.json({ error: 'feedback is unavailable right now' }, { status: 503 });
    }

    const ip = clientIp(request.headers) || 'local';
    if (rateLimited(`feedback:${ip}`, { max: 5, windowMs: 10 * 60_000 })) {
      return Response.json({ error: 'Too many suggestions for now. Please try again shortly.' }, { status: 429 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid request body' }, { status: 400 });
    }

    const parsed = sanitizeFeedbackSubmission(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: parsed.status });
    }
    category = parsed.value.category;

    const pool = await db();
    const id = await insertFeedback(pool, parsed.value, request);
    ok = true;
    return Response.json({ ok: true, id });
  } catch (err) {
    console.error('[/api/feedback]', err);
    return Response.json({ error: 'could not save feedback' }, { status: 500 });
  } finally {
    logUsage({
      request,
      route: 'feedback',
      category,
      status: ok ? 'new' : null,
      ok,
      ms: Date.now() - startedAt,
    });
  }
}
