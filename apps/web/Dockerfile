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

# Build TanStack Start -> apps/web/dist
RUN pnpm --filter web build

# Create a node_modules tree for the web package (including dev deps for vite preview)
RUN pnpm --filter web deploy --legacy /deploy

# ── Stage 2: minimal Node runtime ───────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Copiamos package.json y dependencias (incluye vite)
COPY --from=builder /deploy/package.json ./
COPY --from=builder /deploy/node_modules ./node_modules

# Copiamos la build generada
COPY --from=builder /monorepo/apps/web/dist ./dist
COPY --from=builder /monorepo/apps/web/vite.config.ts ./vite.config.ts
COPY --from=builder /monorepo/apps/web/tsconfig.json ./tsconfig.json

EXPOSE 3001

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3001"]
