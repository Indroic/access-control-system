# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack Overview

Turborepo monorepo managed with `pnpm` (workspaces + catalog) running a TypeScript stack plus a Python sidecar:

- **`apps/web`** — Next.js 16 frontend on port `3001`. Uses HeroUI (`@heroui/react`), TanStack Query/Form, tRPC client, Better-Auth client, React Compiler enabled.
- **`apps/server`** — Hono backend on port `3000`. Mounts Better-Auth at `/api/auth/*` and the tRPC router at `/trpc/*`. Run with `tsx watch` in dev, built with `tsdown`.
- **`apps/biometric-api`** — Python 3.14 FastAPI service on port `8000`. Built with the [HexCore](https://pypi.org/project/hexcore/) hexagonal-architecture framework; uses InsightFace + ONNX Runtime for face recognition and pgvector for embeddings. Routes mounted under `/v1`. Models are warmed up on FastAPI lifespan startup.
- **`packages/api`** — tRPC router definitions, context, and procedure builders (`publicProcedure`, `protectedProcedure`). Consumed by both the server (mounting) and the web app (type-only `AppRouter` import).
- **`packages/auth`** — Better-Auth instance (`createAuth()`) backed by the Drizzle adapter. Houses the custom `faceBiometricsPlugin` that proxies face register/identify/search-user calls to the Python biometric API and uses Better-Auth's `internalAdapter` to update users and create sessions.
- **`packages/db`** — Drizzle ORM (Postgres via `node-postgres`). Schema lives in `src/schema/auth.ts` — the `user` table is extended with `faceRegistered` and `faceMeta` columns. `createDb()` reads `DATABASE_URL` from `@access-control-system/env/server`. Owns Docker-based local Postgres lifecycle scripts.
- **`packages/env`** — `@t3-oss/env-core` / `env-nextjs` schemas. Two subpath exports: `./server` (DATABASE_URL, BETTER_AUTH_*, BIOMETRIC_API_URL, CORS_ORIGIN) and `./web` (NEXT_PUBLIC_SERVER_URL). Import the right one — server vs. browser code.
- **`packages/ui`** — Shared HeroUI/shadcn-style primitives. Exported via subpaths like `@access-control-system/ui/components/button`. Tailwind v4 + `tailwind-variants`. Design tokens in `src/styles/globals.css`. Despite the README mentioning shadcn, the dependencies are HeroUI — both patterns coexist.
- **`packages/config`** — Shared tsconfig/biome bases (currently empty placeholder package).

## Common Commands

All run from the repo root (delegated via Turbo).

```bash
pnpm install                  # install workspaces
pnpm dev                      # start all apps (turbo dev)
pnpm dev:web                  # web only (Next.js on :3001)
pnpm dev:server               # server only (Hono on :3000)
pnpm build                    # build all apps
pnpm check-types              # tsc -b across workspaces
pnpm check                    # Biome format + lint --write
```

Database (delegated to `@access-control-system/db`):

```bash
pnpm db:start                 # docker compose up -d  (local Postgres)
pnpm db:watch                 # docker compose up (foreground)
pnpm db:stop / db:down        # stop / tear down
pnpm db:push                  # drizzle-kit push (sync schema, no migrations)
pnpm db:generate              # generate migrations
pnpm db:migrate               # apply migrations
pnpm db:studio                # open Drizzle Studio
```

Targeting a single workspace directly: `pnpm --filter web <script>` or `turbo -F <name> <task>`.

## Docker dev environment

`docker-compose up` from the root brings up all services with hot reload via `docker-compose.override.yml` (Dockerfiles: `Dockerfile.dev.{server,web,biometric}`). Container names: `acs-server`, `acs-web`, `acs-biometric`, `acs-postgres`. See `DOCKER_DEV.md` for the full guide (in Spanish).

## Architectural Notes

- **End-to-end type safety from the tRPC router**: `apps/web` imports the `AppRouter` *type* from `@access-control-system/api/routers/index` (no runtime dependency). The tRPC client at `apps/web/src/utils/trpc.ts` wires it to TanStack Query via `@trpc/tanstack-react-query`, with a global `QueryCache` `onError` that surfaces `toast.error` notifications. `credentials: "include"` is required because auth uses cookies across origins.

- **Auth flow**: The Hono server forwards `/api/auth/*` to `auth.handler(c.req.raw)`. `createContext` calls `auth.api.getSession({ headers })` — `protectedProcedure` rejects with `UNAUTHORIZED` when `ctx.session` is missing. Cookies are configured with `sameSite: "none"` / `secure: true` / `httpOnly: true`, so dev across `localhost:3000` ↔ `localhost:3001` requires HTTPS or matching `CORS_ORIGIN`.

- **Face biometrics bridge** (`packages/auth/src/plugins/biometric.ts`): A Better-Auth plugin exposing three endpoints — `register-face`, `authenticate-face`, `search-user-by-face`. It receives a base64 image, converts it to a `Blob`, POSTs multipart `FormData` to `BIOMETRIC_API_URL` (the Python service), then either updates `user.faceMeta` (register) or calls `internalAdapter.createSession(user.id)` (authenticate). Failures surface as Better-Auth `APIError`s with explicit HTTP statuses (`BAD_GATEWAY`, `NOT_FOUND`).

- **Python biometric service follows HexCore / Hexagonal Architecture**: `apps/biometric-api/src/features/biometrics/{domain,application,infrastructure}` — domain entities/repositories, application use cases (incl. `WarmupBiometricsUseCase` run on startup), and infrastructure (FastAPI router + repositories backed by pgvector). When editing this app, respect the layer boundaries: domain knows nothing about FastAPI; infrastructure adapts to domain interfaces. The `hexcore` skill is available for in-depth guidance.

- **Schema is the auth boundary**: When adding a new domain model, prefer extending the existing `user` table columns (as `faceRegistered`/`faceMeta` did) only for direct auth-adjacent state. Anything bigger should be a new schema file under `packages/db/src/schema/` and re-exported from `schema/index.ts`.

- **Environment validation is strict**: `@t3-oss/env-core` will throw at module load if vars are missing. Add new vars to `packages/env/src/server.ts` (or `web.ts`) with Zod constraints — don't read `process.env` directly from app code.

## Conventions

- **Biome** is the formatter and linter (config in `biome.json`): tabs for indentation, double-quoted strings, organize-imports on. Tailwind class sorting is enforced via `useSortedClasses` (recognizes `clsx`, `cva`, `cn`). Run `pnpm check` before committing.
- **Shared deps via pnpm catalog**: React, Zod, tRPC, Hono, Better-Auth, Tailwind, etc. are pinned in `pnpm-workspace.yaml` — reference with `"react": "catalog:"` in workspace `package.json` files, don't pin versions directly.
- **Imports use the `@access-control-system/*` scope** for workspace packages. UI components import via `@access-control-system/ui/components/<name>`. The catch-all `./*` export in `api`/`auth`/`db` lets you import any source file directly (e.g. `@access-control-system/api/routers/index`).
- **Adding shadcn/HeroUI primitives**: run `npx shadcn@latest add <component> -c packages/ui` from the repo root to add to the shared package; from `apps/web` to add an app-local block.

## Existing instructions to follow

- `.claude/CLAUDE.md` contains CodeGraph guidance: the `.codegraph/` directory is present, so prefer `codegraph_search`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, and `codegraph_context` over plain grep for symbol lookups and impact analysis. Pass the same instruction to spawned Explore agents.
