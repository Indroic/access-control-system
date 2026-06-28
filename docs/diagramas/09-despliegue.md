# Diagrama de Despliegue (UML Deployment)

Modela la topología física de ejecución: **nodos** (contenedores / dispositivos), los **artefactos** que se despliegan en cada uno y los **canales de comunicación** entre ellos. Refleja el `docker-compose` del proyecto (`docker-compose.yml` + `docker-compose.override.yml`).

Convenciones gráficas (Mermaid):

- `subgraph` con estereotipo `<<device>>` / `<<container>>` — nodo de ejecución
- Caja interna — artefacto desplegable (imagen / build)
- Flechas etiquetadas con el **protocolo** y **puerto** del canal de comunicación

---

## Vista general (Docker Compose)

```mermaid
flowchart TB
    subgraph CLIENT["&lt;&lt;device&gt;&gt; Navegador del Cliente"]
        BROWSER["Aplicación Web (SPA)<br/>TanStack Start + HeroUI<br/>WebRTC getUserMedia / MediaPipe"]
    end

    subgraph HOST["&lt;&lt;device&gt;&gt; Host Docker — red 'app'"]

        subgraph N_WEB["&lt;&lt;container&gt;&gt; acs-web : 3001"]
            A_WEB["artefacto: apps/web<br/>Node 22 (Vite SSR)"]
        end

        subgraph N_SRV["&lt;&lt;container&gt;&gt; acs-server : 3000"]
            A_SRV["artefacto: apps/server<br/>Hono + Better-Auth + tRPC"]
        end

        subgraph N_BIO["&lt;&lt;container&gt;&gt; acs-biometric : 8000"]
            A_BIO["artefacto: apps/biometric-api<br/>FastAPI + HexCore<br/>InsightFace / ONNX Runtime"]
        end

        subgraph N_PG["&lt;&lt;container&gt;&gt; acs-postgres : 5432"]
            A_PG["artefacto: pgvector/pgvector:pg18<br/>DB 'access-control-system'"]
        end

        subgraph N_MIG["&lt;&lt;container&gt;&gt; jobs efímeros (run-once)"]
            A_M1["acs-migrate<br/>drizzle-kit db:push"]
            A_M2["acs-biometric-migrate<br/>alembic upgrade head"]
        end

        V_PG[("volume: postgres_data")]
        V_MODEL[("volume: insightface_models<br/>~400 MB buffalo_l .onnx")]
    end

    subgraph HW["&lt;&lt;device&gt;&gt; Hardware Puerta (futuro)"]
        RELAY["Relé GPIO / Arduino<br/>/dev/ttyUSB0 — NO implementado"]
    end

    BROWSER -->|"HTTPS :3001<br/>HTML/JS/CSS"| N_WEB
    BROWSER -->|"HTTP/JSON :3000<br/>fetch + cookies (credentials:include)"| N_SRV
    N_WEB -.->|"NEXT_PUBLIC_SERVER_URL :3000"| N_SRV

    N_SRV -->|"HTTP/REST :8000<br/>multipart + Bearer INTERNAL_API_KEY"| N_BIO
    N_BIO -->|"HTTP :3000<br/>JWKS / verify-one-time-token"| N_SRV

    N_SRV -->|"TCP :5432<br/>node-postgres (Drizzle)"| N_PG
    N_BIO -->|"TCP :5432<br/>asyncpg + pgvector"| N_PG

    A_PG --- V_PG
    A_BIO --- V_MODEL

    A_M1 -->|"db:push (schema TS)"| N_PG
    A_M2 -->|"alembic (user_faces, audit)"| N_PG

    N_BIO -.->|"open-door (pendiente)"| RELAY
```

---

## Catálogo de nodos

| Nodo (contenedor) | Imagen / Build | Puerto host→cont. | Artefacto desplegado | Dependencias de arranque |
|-------------------|----------------|-------------------|----------------------|--------------------------|
| `acs-web` | `Dockerfile.dev.web` (node:22) | `3001:3001` | `apps/web` (TanStack Start) | `server` healthy |
| `acs-server` | `Dockerfile.dev.server` (node:22) | `3000:3000` | `apps/server` (Hono) | `postgres` healthy, `acs-migrate` done |
| `acs-biometric` | `Dockerfile.dev.biometric` (python:3.14-slim) | `8000:8000` | `apps/biometric-api` (FastAPI) | `postgres` healthy, `acs-biometric-migrate` done, `server` healthy |
| `acs-postgres` | `pgvector/pgvector:pg18` | `5432:5432` | DB `access-control-system` | — (raíz) |
| `acs-migrate` | `node:22-alpine` | — (efímero) | `drizzle-kit push` | `postgres` healthy |
| `acs-biometric-migrate` | `python:3.14-slim` | — (efímero) | `alembic upgrade head` | `postgres` healthy, `acs-migrate` done |

## Canales de comunicación

| Origen | Destino | Protocolo / Puerto | Carga útil |
|--------|---------|--------------------|------------|
| Navegador | `acs-web` | HTTPS :3001 | Activos estáticos + SSR |
| Navegador | `acs-server` | HTTP/JSON :3000 (cookies) | Auth, tRPC, biometría base64 |
| `acs-server` | `acs-biometric` | HTTP/REST :8000 (`Bearer INTERNAL_API_KEY`) | `multipart/form-data` (imágenes), eventos de auditoría |
| `acs-biometric` | `acs-server` | HTTP :3000 | JWKS RS256, verificación de One-Time-Token |
| `acs-server` | `acs-postgres` | TCP :5432 (node-postgres) | SQL Drizzle (user/session/account/audit) |
| `acs-biometric` | `acs-postgres` | TCP :5432 (asyncpg) | SQL + pgvector (`user_faces`, `biometric_audit_log`) |

> **Nota:** En desarrollo local sin Docker los servicios corren en `localhost` (mismos puertos). El despliegue mostrado usa la red interna `app` de Docker Compose, donde los hostnames son los nombres de servicio (`postgres`, `server`, `biometric-api`).
