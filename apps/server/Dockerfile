# ── Stage 1: install & build ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /monorepo

# Copy manifests first so layer-caching skips re-installs when source changes
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json  ./packages/config/
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/db/package.json      ./packages/db/
COPY packages/env/package.json     ./packages/env/
COPY apps/server/package.json      ./apps/server/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

# Bundle workspace deps + compile TypeScript → dist/index.mjs
RUN pnpm --filter server build

# Create a production-only node_modules tree for the server package
RUN pnpm --filter server deploy --prod /deploy

# ── Stage 2: minimal runtime ──────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# External npm deps (hono, better-auth, pg, …) from the deploy stage
COPY --from=builder /deploy/node_modules ./node_modules

# Bundled output (includes all @access-control-system/* workspace packages)
COPY --from=builder /monorepo/apps/server/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.mjs"]
