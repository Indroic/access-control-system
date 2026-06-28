# Diagrama de Componentes (UML Component)

Modela las unidades de software desplegables y sus **interfaces provistas/requeridas** (puertos). Cada paquete del monorepo y cada feature de la API es un componente; las dependencias se expresan como conectores entre interfaces.

Convenciones (Mermaid): `subgraph` = componente compuesto, caja = componente/módulo, flecha etiquetada = interfaz consumida (lollipop lógico).

---

## Vista de componentes del sistema

```mermaid
flowchart TB
    subgraph WEB["&lt;&lt;component&gt;&gt; apps/web (TanStack Start)"]
        UI_ADMIN["routes/admin<br/>gestión usuarios + auditoría"]
        UI_ACCESS["routes/access<br/>kiosko reconocimiento facial"]
        UI_ENROLL["face-enrollment<br/>+ use-camera / use-pose-detector"]
        TRPC_CLIENT["trpc client + authClient"]
    end

    subgraph SERVER["&lt;&lt;component&gt;&gt; apps/server (Hono :3000)"]
        HONO["Hono app + CORS + logger"]
        SSE["SSE /api/sse/live-updates"]
        SETUP["setup-admin / one-time-token/verify"]
    end

    subgraph PKG_API["&lt;&lt;component&gt;&gt; packages/api (tRPC)"]
        ROUTER["appRouter"]
        R_USERS["usersRouter"]
        R_DOOR["doorRouter"]
        R_AUDIT["auditRouter"]
        CTX["createContext / protectedProcedure"]
    end

    subgraph PKG_AUTH["&lt;&lt;component&gt;&gt; packages/auth (Better-Auth)"]
        AUTH_CORE["createAuth() + admin()"]
        PLUGIN["faceBiometricsPlugin<br/>register / authenticate / search"]
        ADAPTER["internalAdapter"]
        HOOKS["hooks.after → audit login-event"]
    end

    subgraph PKG_DB["&lt;&lt;component&gt;&gt; packages/db (Drizzle)"]
        SCHEMA["schema: user, session, account,<br/>oneTimeToken, auditLog"]
        CREATEDB["createDb()"]
    end

    subgraph PKG_ENV["&lt;&lt;component&gt;&gt; packages/env"]
        ENV_S["env/server"]
        ENV_W["env/web"]
    end

    subgraph BIO["&lt;&lt;component&gt;&gt; apps/biometric-api (FastAPI :8000)"]
        FB["feature: biometrics<br/>register / identify / open-door"]
        FA["feature: audit<br/>login-event / list"]
        ENGINE["FaceEngine (InsightFace/ONNX)"]
        SHARED["shared: auth deps (JWKS/OTT)"]
    end

    PG[("&lt;&lt;component&gt;&gt;<br/>PostgreSQL + pgvector")]

    %% --- conectores (interfaz requerida) ---
    UI_ADMIN --> TRPC_CLIENT
    UI_ACCESS --> TRPC_CLIENT
    UI_ENROLL --> TRPC_CLIENT
    TRPC_CLIENT -->|"HTTP /api/trpc/*"| HONO
    TRPC_CLIENT -->|"HTTP /api/auth/*"| HONO

    HONO --> ROUTER
    HONO --> AUTH_CORE
    HONO --> SSE
    HONO --> SETUP
    ROUTER --- R_USERS & R_DOOR & R_AUDIT
    ROUTER --> CTX
    CTX -->|"getSession"| AUTH_CORE

    AUTH_CORE --> PLUGIN
    AUTH_CORE --> ADAPTER
    AUTH_CORE --> HOOKS
    PLUGIN -->|"REST multipart<br/>Bearer INTERNAL_API_KEY"| FB
    HOOKS -->|"POST /v1/audit/login-event"| FA
    R_AUDIT -->|"GET /v1/audit"| FA
    ADAPTER --> CREATEDB

    R_USERS --> CREATEDB
    R_DOOR --> CREATEDB
    CREATEDB --> SCHEMA --> PG

    FB --> ENGINE
    FB --> SHARED
    FA --> SHARED
    SHARED -->|"JWKS / verify-OTT"| HONO
    FB -->|"SQLAlchemy + pgvector"| PG
    FA -->|"SQLAlchemy"| PG

    AUTH_CORE -.->|"lee"| ENV_S
    HONO -.->|"lee"| ENV_S
    TRPC_CLIENT -.->|"lee"| ENV_W
```

---

## Interfaces principales (puertos)

| Componente | Interfaz **provista** | Interfaz **requerida** |
|------------|----------------------|------------------------|
| `apps/web` | — (cliente) | `/api/trpc/*`, `/api/auth/*` (HTTP+cookies) |
| `apps/server` (Hono) | `/api/auth/*`, `/api/trpc/*`, `/api/sse/*`, `/api/setup-*` | `getSession` (auth), `appRouter` (api) |
| `packages/api` | `appRouter` (tipado E2E) | `auth.api.getSession`, `createDb`, `BIOMETRIC_API_URL` |
| `packages/auth` | `auth.handler`, `internalAdapter`, plugin endpoints | `createDb`, REST biométrico, `env/server` |
| `packages/db` | `createDb`, `schema` | `DATABASE_URL` |
| `apps/biometric-api` | `/v1/biometrics/*`, `/v1/audit/*` | JWKS/OTT del server, PostgreSQL+pgvector |
| `packages/env` | `env/server`, `env/web` (validados) | `process.env` |

> **Tipado end-to-end:** `apps/web` importa solo el **tipo** `AppRouter` de `packages/api` (sin dependencia en tiempo de ejecución), lo que se representa como conector punteado de contrato, no de invocación directa.
