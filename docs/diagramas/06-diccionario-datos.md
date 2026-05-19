# Diccionario de Datos — access-control-system

Definición campo por campo de todas las tablas persistentes. Convenciones:

- **Tipo**: tipo Postgres real (no el alias TypeScript/SQLAlchemy).
- **N**: nullable (✓ si admite NULL).
- **U**: unique.
- **Idx**: indexado (✓ si existe índice no único).
- **Origen**: módulo que escribe el campo.

---

## BD `access-control-system`

### Tabla `user`

Fichero fuente: [packages/db/src/schema/auth.ts](../../packages/db/src/schema/auth.ts)

| # | Campo | Tipo | PK | N | U | Idx | Default | Descripción | Origen |
|---|-------|------|----|----|----|----|---------|-------------|--------|
| 1 | `id` | `text` | ✓ |  | ✓ |  | — | Identificador del usuario. Generado por Better-Auth (CUID/ULID). | Better-Auth `signUp` |
| 2 | `name` | `text` |  |  |  |  | — | Nombre visible del usuario. Capturado en el formulario de registro. | Formulario sign-up |
| 3 | `email` | `text` |  |  | ✓ |  | — | Correo electrónico. Sirve como identificador para el login. | Formulario sign-up |
| 4 | `email_verified` | `boolean` |  |  |  |  | `false` | Indica si el email fue verificado. Actualmente sin flujo activo. | Better-Auth (futuro) |
| 5 | `image` | `text` |  | ✓ |  |  | — | URL del avatar del usuario (opcional). | Better-Auth perfil |
| 6 | `face_registered` | `boolean` |  |  |  |  | `false` | Verdadero cuando existe ≥1 fila en `biometric_db.user_faces`. | `faceBiometricsPlugin.registerFaceHandler` |
| 7 | `face_meta` | `jsonb` |  | ✓ |  |  | `null` | Snapshot del último registro biométrico: `{ registeredAt, source, biometricResponse }`. | `faceBiometricsPlugin.registerFaceHandler` |
| 8 | `created_at` | `timestamp` |  |  |  |  | `now()` | Fecha de creación de la cuenta. | Drizzle defaultNow |
| 9 | `updated_at` | `timestamp` |  |  |  |  | `now()` | Última modificación. Drizzle ejecuta `$onUpdate` en cada update. | Drizzle `$onUpdate` |

**Reglas de negocio**:
- `face_registered = true` implica existencia de filas en `user_faces` (validación a nivel aplicación).
- `email` se normaliza a minúsculas por Better-Auth antes de insertar.

---

### Tabla `session`

| # | Campo | Tipo | PK | N | U | Idx | Default | Descripción |
|---|-------|------|----|----|----|----|---------|-------------|
| 1 | `id` | `text` | ✓ |  | ✓ |  | — | Identificador interno de la sesión. |
| 2 | `expires_at` | `timestamp` |  |  |  |  | — | Fecha/hora de expiración. Por defecto 7 días desde creación. |
| 3 | `token` | `text` |  |  | ✓ |  | — | Token de sesión que viaja en la cookie httpOnly. |
| 4 | `created_at` | `timestamp` |  |  |  |  | `now()` | Inicio de la sesión. |
| 5 | `updated_at` | `timestamp` |  |  |  |  | — | Última renovación de la sesión. |
| 6 | `ip_address` | `text` |  | ✓ |  |  | — | IP origen al crear la sesión. |
| 7 | `user_agent` | `text` |  | ✓ |  |  | — | User-Agent del cliente. |
| 8 | `user_id` | `text` |  |  |  | ✓ | — | FK → `user.id`. ON DELETE CASCADE. |

**Restricciones**:
- `session_userId_idx` sobre `user_id` (no único — un user puede tener múltiples sesiones simultáneas).
- ON DELETE CASCADE desde `user`.

---

### Tabla `account`

| # | Campo | Tipo | PK | N | U | Idx | Default | Descripción |
|---|-------|------|----|----|----|----|---------|-------------|
| 1 | `id` | `text` | ✓ |  | ✓ |  | — | Identificador interno de la cuenta vinculada. |
| 2 | `account_id` | `text` |  |  |  |  | — | ID en el sistema del proveedor (igual a `user_id` para credenciales locales). |
| 3 | `provider_id` | `text` |  |  |  |  | — | Proveedor: `credential` para email+password; futuros: `google`, `github`. |
| 4 | `user_id` | `text` |  |  |  | ✓ | — | FK → `user.id`. ON DELETE CASCADE. |
| 5 | `access_token` | `text` |  | ✓ |  |  | — | Token de acceso del proveedor OAuth (cuando aplica). |
| 6 | `refresh_token` | `text` |  | ✓ |  |  | — | Token de refresco OAuth. |
| 7 | `id_token` | `text` |  | ✓ |  |  | — | ID Token OIDC. |
| 8 | `access_token_expires_at` | `timestamp` |  | ✓ |  |  | — | Caducidad del access token. |
| 9 | `refresh_token_expires_at` | `timestamp` |  | ✓ |  |  | — | Caducidad del refresh token. |
| 10 | `scope` | `text` |  | ✓ |  |  | — | Scopes OAuth concedidos. |
| 11 | `password` | `text` |  | ✓ |  |  | — | Hash bcrypt/argon de password (solo para `provider_id = credential`). |
| 12 | `created_at` | `timestamp` |  |  |  |  | `now()` | Vinculación inicial. |
| 13 | `updated_at` | `timestamp` |  |  |  |  | — | Última renovación de tokens. |

**Reglas**:
- Un `user` puede tener N `account`s (uno por proveedor).
- `password` SOLO se setea cuando `provider_id = 'credential'`. Para OAuth queda NULL.

---

### Tabla `verification`

| # | Campo | Tipo | PK | N | U | Idx | Default | Descripción |
|---|-------|------|----|----|----|----|---------|-------------|
| 1 | `id` | `text` | ✓ |  | ✓ |  | — | Identificador del registro de verificación. |
| 2 | `identifier` | `text` |  |  |  | ✓ | — | Email u otra identidad a verificar. |
| 3 | `value` | `text` |  |  |  |  | — | Código o token de verificación (one-time). |
| 4 | `expires_at` | `timestamp` |  |  |  |  | — | Caducidad del valor. |
| 5 | `created_at` | `timestamp` |  |  |  |  | `now()` | Cuándo se emitió. |
| 6 | `updated_at` | `timestamp` |  |  |  |  | `now()` | Cuándo se actualizó. |

**Uso**: Better-Auth la utiliza para flujos como password reset, magic links, email verification y One-Time-Tokens (consumidos por el biometric-api en `verify_one_time_token`).

---

## BD `biometric_db`

### Tabla `user_faces`

Fichero fuente: [apps/biometric-api/src/shared/infrastructure/database/models/\_\_init\_\_.py](../../apps/biometric-api/src/shared/infrastructure/database/models/__init__.py)
Migraciones: [apps/biometric-api/alembic/versions/](../../apps/biometric-api/alembic/versions/)

| # | Campo | Tipo | PK | N | U | Idx | Default | Descripción |
|---|-------|------|----|----|----|----|---------|-------------|
| 1 | `id` | `uuid` | ✓ |  | ✓ |  | — | UUID generado por `BaseEntity` de HexCore. |
| 2 | `user_id` | `varchar` |  |  |  | ✓ | — | Identificador del usuario en `access-control-system.user.id`. **Sin FK física** (cross-database). |
| 3 | `embedding` | `vector(512)` |  | ✓ |  |  | — | Embedding facial normalizado (ArcFace / InsightFace buffalo_l). Migración `9382f584012c` lo amplió de 128→512 dimensiones. |
| 4 | `is_active` | `boolean` |  |  |  |  | — | Soft-delete flag de `BaseEntity`. Actualmente no consultado en queries. |
| 5 | `created_at` | `timestamptz` |  |  |  |  | — | Fecha de inserción de la muestra. |
| 6 | `updated_at` | `timestamptz` |  |  |  |  | — | Última modificación. |

**Reglas de negocio**:

- Un mismo `user_id` puede tener N filas (`RegisterBiometricsUseCase` inserta una por imagen del lote).
- La consulta de identificación es:
  ```sql
  SELECT * FROM user_faces
   ORDER BY embedding <-> $1   -- distancia L2 con pgvector
   LIMIT 1;
  ```
- **Observación**: actualmente no se aplica umbral (`threshold`) — el vecino más cercano siempre se interpreta como match. Ver hallazgo #4 en `ARCHITECTURE.md`.

**Índice recomendado** (no presente):

```sql
CREATE INDEX user_faces_embedding_idx
  ON user_faces USING hnsw (embedding vector_l2_ops);
```

---

## Datos en tránsito (no persistentes)

Estructuras de datos que viajan por el sistema sin almacenarse directamente, definidas con Zod o Pydantic.

### DTO `RegisterFaceRequest` (Better-Auth plugin)

Definido en [packages/auth/src/plugins/biometric.ts](../../packages/auth/src/plugins/biometric.ts).

| Campo | Tipo | Validación | Descripción |
|-------|------|------------|-------------|
| `imageBase64` | `string` | `min(1)` | Imagen serializada en base64 (puede incluir prefijo `data:image/...;base64,`). |
| `mimeType` | `string?` | `min(1)` | MIME opcional. Default `image/jpeg`. |
| `userId` | `string` | `min(1)` | ID del usuario al que asociar el rostro. |

### DTO `AuthenticateFaceRequest`

| Campo | Tipo | Validación | Descripción |
|-------|------|------------|-------------|
| `imageBase64` | `string` | `min(1)` | Imagen para identificar. |
| `mimeType` | `string?` | `min(1)` | MIME opcional. |

### DTO `IdentificationResponse` (Python)

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `user_id` | `str?` | `None` | ID del usuario coincidente (si `match=True`). |
| `match` | `bool` | `False` | `True` cuando se encontró vecino más cercano. |
| `message` | `str` | `""` | Texto descriptivo del resultado. |

### DTO `OneTimeTokenSession`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `user_id` | `str` | Identidad extraída del payload del OTT. |
| `email` | `str?` | Email asociado (si lo entrega Better-Auth). |
| `name` | `str?` | Nombre asociado. |
| `raw_session` | `dict` | Payload completo recibido al verificar el token. |

---

## Variables de entorno (configuración persistente del sistema)

Validadas con `@t3-oss/env-*` (Zod) en [packages/env/src/](../../packages/env/src/).

### Servidor (Hono)

| Variable | Tipo | Obligatoria | Default | Descripción |
|----------|------|-------------|---------|-------------|
| `DATABASE_URL` | URL Postgres | ✓ | — | Cadena de conexión a `access-control-system`. |
| `BETTER_AUTH_SECRET` | string ≥ 32 | ✓ | — | Secreto para firmar tokens de Better-Auth. |
| `BETTER_AUTH_URL` | URL | ✓ | — | URL pública del servidor (p.ej. `http://localhost:3000`). |
| `BIOMETRIC_API_URL` | URL | ✗ | `http://localhost:8000` | Endpoint del servicio Python. |
| `CORS_ORIGIN` | URL | ✓ | — | Origen permitido para CORS (web). |
| `NODE_ENV` | enum | ✗ | `development` | `development \| production \| test`. |

### Web (Next.js)

| Variable | Tipo | Obligatoria | Descripción |
|----------|------|-------------|-------------|
| `NEXT_PUBLIC_SERVER_URL` | URL | ✓ | URL pública del backend Hono. |

### Biometric-API (Python)

| Variable | Descripción |
|----------|-------------|
| `SQL_DATABASE_URL` | Conexión síncrona a `biometric_db`. |
| `ASYNC_SQL_DATABASE_URL` | Conexión async (`postgresql+asyncpg://...`). |
| `BETTER_AUTH_URL` | URL del servicio Hono (para validación de OTT). |
| `BETTER_AUTH_ISSUER` | Issuer esperado en el JWT. |
| `BETTER_AUTH_AUDIENCE` | Audience esperada en el JWT. |
| `auth_jwks_url` | Endpoint JWKS para verificar firmas. |
| `better_auth_jwt_algorithm` | Algoritmo esperado en el JWT (p.ej. `RS256`). |
