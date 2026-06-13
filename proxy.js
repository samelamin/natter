import { NextResponse } from 'next/server';

function decodeBasic(header) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function sameText(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function challenge() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Natter feedback"',
      'Cache-Control': 'no-store',
    },
  });
}

export function proxy(request) {
  const expectedUser = process.env.NATTER_ADMIN_USER;
  const expectedPassword = process.env.NATTER_ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return new Response('Admin credentials are not configured', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const basic = decodeBasic(request.headers.get('authorization') || '');
  if (!basic || !sameText(basic.user, expectedUser) || !sameText(basic.password, expectedPassword)) {
    return challenge();
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/feedback/:path*',
};
