import { adminAuthResult, adminChallenge, sanitizeFeedbackUpdate, updateFeedback } from '@/lib/feedback.js';
import { db, dbAvailable } from '@/lib/db.js';

async function readPatch(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return {
      status: form.get('status') || undefined,
      notes: form.has('notes') ? String(form.get('notes') || '') : undefined,
      redirectTo: form.get('redirectTo') || null,
    };
  }
  const body = await request.json();
  return { ...body, redirectTo: null };
}

async function handleUpdate(request, context, { redirectOnSuccess = false } = {}) {
  if (!adminAuthResult(request).ok) {
    return adminChallenge();
  }
  if (!dbAvailable()) {
    return Response.json({ error: 'feedback storage unavailable' }, { status: 503 });
  }

  let body;
  try {
    body = await readPatch(request);
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 });
  }

  const parsed = sanitizeFeedbackUpdate(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const { id } = await context.params;
  const pool = await db();
  const item = await updateFeedback(pool, id, parsed.value);
  if (!item) {
    return Response.json({ error: 'feedback not found' }, { status: 404 });
  }

  if (redirectOnSuccess) {
    const fallback = new URL('/admin/feedback', request.url);
    const target = body.redirectTo ? new URL(String(body.redirectTo), request.url) : fallback;
    if (target.origin !== fallback.origin) return Response.redirect(fallback, 303);
    return Response.redirect(target, 303);
  }

  return Response.json({ item }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request, context) {
  return handleUpdate(request, context);
}

export async function POST(request, context) {
  return handleUpdate(request, context, { redirectOnSuccess: true });
}
