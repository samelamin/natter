import { adminAuthResult, adminChallenge, buildFeedbackListOptions, listFeedback } from '@/lib/feedback.js';
import { db, dbAvailable } from '@/lib/db.js';

export async function GET(request) {
  if (!adminAuthResult(request).ok) {
    return adminChallenge();
  }
  if (!dbAvailable()) {
    return Response.json({ error: 'feedback storage unavailable' }, { status: 503 });
  }

  const url = new URL(request.url);
  const options = buildFeedbackListOptions(url.searchParams);
  const pool = await db();
  const items = await listFeedback(pool, options);
  return Response.json({ items, options }, { headers: { 'Cache-Control': 'no-store' } });
}
