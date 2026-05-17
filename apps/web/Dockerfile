# ── Stage 1: install & build ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /monorepo

# Copy manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json  ./packages/config/
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/db/package.json      ./packages/db/
COPY packages/env/package.json     ./packages/env/
COPY packages/ui/package.json      ./packages/ui/
COPY apps/web/package.json         ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# NEXT_PUBLIC_* vars must be available at build time
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL

RUN pnpm --filter web build

# ── Stage 2: minimal standalone runtime ──────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# next build --output standalone traces all runtime deps into .next/standalone
COPY --from=builder /monorepo/apps/web/.next/standalone ./
COPY --from=builder /monorepo/apps/web/.next/static      ./apps/web/.next/static
COPY --from=builder /monorepo/apps/web/public            ./apps/web/public

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
