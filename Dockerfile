# syntax=docker/dockerfile:1
# Multi-stage build producing a small Next.js standalone runtime image.
# Next 16 requires Node >=20.9; .nvmrc pins 20.

# 1) Install dependencies (cached unless lockfile changes)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build the app (produces .next/standalone via output:'standalone')
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Runtime — only the standalone server + static assets, no node_modules install
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# server.js + traced node_modules live at the root of .next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# static assets and public/ are NOT bundled into standalone — copy them in
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
