/** @type {import('next').NextConfig} */

// Security headers applied to every response.
// Note: frame-ancestors here is a CSP directive controlling who may embed *this*
// app. YouTube trailer iframes are outbound embeds (this app loads youtube.com),
// so they are completely unaffected by frame-ancestors.
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=15552000; includeSubDomains',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Content-Security-Policy',
    // frame-ancestors ONLY — full CSP is out of scope.
    value: "frame-ancestors 'self'",
  },
  {
    key: 'Permissions-Policy',
    // microphone must stay allowed for same-origin voice input.
    value: 'camera=(), geolocation=(), microphone=(self)',
  },
];

const nextConfig = {
  // Emit a self-contained .next/standalone build (server.js + traced deps)
  // for a small Docker runtime image. See config/next-config-js/output.
  output: 'standalone',
  // Pin the workspace root to this project. Stray parent lockfiles (e.g.
  // ~/package-lock.json) otherwise make Next infer a higher root, nesting
  // server.js under .next/standalone/<path>/ and breaking the Docker COPY/CMD.
  // See config/next-config-js/turbopack#root-directory.
  turbopack: {
    root: import.meta.dirname,
  },
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  images: {
    // App images go through our own /img proxy; only TMDB is a legitimate
    // remote source. A wildcard here would let anyone use /_next/image as an
    // open proxy for arbitrary hosts.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
    ],
  },
};

export default nextConfig;
