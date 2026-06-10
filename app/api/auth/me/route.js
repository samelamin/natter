/**
 * GET /api/auth/me — { user: { email, services } } or { user: null }.
 */

import { getSessionUser } from '@/lib/auth.js';

export async function GET(request) {
  const user = await getSessionUser(request);
  return new Response(
    JSON.stringify({ user: user ? { email: user.email, services: user.services } : null }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}
