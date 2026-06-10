/**
 * GET /img/<size>/<file>  →  proxies image.tmdb.org/t/p/<size>/<file>
 *
 * Why: hotlinking image.tmdb.org breaks for visitors whose network, region, or
 * browser extension blocks TMDB's image CDN — they get broken-image icons.
 * Serving images from our own origin (cached by Cloudflare) avoids that: the
 * browser only ever talks to natter.cc; the server fetches from TMDB.
 *
 * Not an open proxy — the upstream host is hardcoded and the path must match a
 * strict "<size>/<file>.<ext>" shape.
 */

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';
// e.g. "w780/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg"
const SAFE_PATH = /^(w\d{2,4}|h\d{2,4}|original)\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/i;

export async function GET(_request, { params }) {
  const { path } = await params;
  const rel = (path || []).join('/');

  if (rel.includes('..') || !SAFE_PATH.test(rel)) {
    return new Response('Not found', { status: 404 });
  }

  let upstream;
  try {
    upstream = await fetch(`${TMDB_IMG_BASE}/${rel}`);
  } catch {
    return new Response('Bad gateway', { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('Not found', { status: upstream.status });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  // TMDB filenames are content-hashed, so the bytes never change — cache hard.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);

  return new Response(upstream.body, { status: 200, headers });
}
