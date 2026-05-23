# ── Stage 1: install & build (TanStack Start + Vite) ────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /monorepo

# Manifests first so layer cache survives source-only edits
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json  ./packages/config/
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/db/package.json      ./packages/db/
COPY packages/env/package.json     ./packages/env/
COPY apps/web/package.json         ./apps/web/

RUN pnpm install --frozen-lockfile

# Sources
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Build TanStack Start → apps/web/.output (Nitro)
RUN pnpm --filter web build

# ── Stage 2: minimal Node runtime ───────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Nitro bundles its own server.mjs + node_modules under .output/
COPY --from=builder /monorepo/apps/web/.output ./

EXPOSE 3001

CMD ["node", "server/index.mjs"]
