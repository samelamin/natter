/** @type {import('next').NextConfig} */
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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
