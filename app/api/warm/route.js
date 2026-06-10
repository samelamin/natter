// Unauthenticated but harmless — it can only populate cache for queries the UI
// already exposes, is self-throttling (skips warm keys, sequential + delays),
// and no-ops without Redis.

import { warmTrendingChips } from '@/lib/warm.js';

// Never statically evaluated at build — the warmer lazy-imports lib/agent.js.
export const dynamic = 'force-dynamic';

export async function GET() {
  // Fire-and-forget — respond immediately; warm runs in the background.
  warmTrendingChips().catch(() => {});
  return Response.json({ ok: true, started: true });
}
