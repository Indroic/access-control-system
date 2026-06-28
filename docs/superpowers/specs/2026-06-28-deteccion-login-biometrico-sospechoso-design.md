# Diseño — Detección de inicios de sesión biométricos sospechosos

- **Fecha:** 2026-06-28
- **Estado:** Aprobado (pendiente de plan de implementación)
- **Autor:** David (con Claude, modo arquitecto HexCore)

## 1. Objetivo

Detectar inicios de sesión **biométricos** que ocurren a una hora inusual para el
usuario, basándose en el **cálculo estadístico de sus horas comunes** (estadística
circular / von Mises). Cuando un login se considera sospechoso:

1. **El login nunca se bloquea ni se ralentiza** (la cara coincidió → identidad
   verificada; un timing anómalo no es fraude de identidad).
2. Se **registra** un evento de auditoría `biometric_suspicious_login`.
3. Se **persiste la foto** capturada del intento (en SeaweedFS).
4. Se **notifica** al admin por **SSE** (admin con dashboard abierto) y por
   **Web Push** (fallback cuando no hay nadie conectado).

### No-objetivos (YAGNI)

- No se bloquea ningún acceso por la heurística.
- No se modela día de la semana ni geolocalización/IP como dimensión de anomalía
  (solo **hora del día**, según el requisito "horas comunes").
- No se introduce object storage S3/MinIO ni broker de mensajes; SeaweedFS cubre el
  almacenamiento y el callback HTTP interno cubre la señalización entre servicios.
- No se materializa un "perfil" por usuario en tabla aparte: la estadística se
  calcula al vuelo desde el historial de auditoría (el volumen de accesos por puerta
  es bajo).

## 2. Contexto actual (lo que ya existe)

- **Login biométrico:** `apps/web` → `POST /api/auth/face-biometrics/authenticate-face`
  (plugin Better-Auth en `packages/auth/src/plugins/biometric.ts`) → reenvía a Python
  `POST /v1/biometrics/identify` → `{ match, user_id }` → el plugin hace
  `internalAdapter.createSession(user.id)` y pone la cookie.
- **`/v1/biometrics/identify`** (`apps/biometric-api/.../biometrics/infrastructure/api.py`)
  ya está decorado con `@audit_endpoint`, que registra `biometric_access_granted` /
  `biometric_access_denied` en la tabla `biometric_audit_log` con `user_id`,
  `ip_address`, `user_agent`, `details` y `created_at` (de `BaseModel` de HexCore).
- **`search-user-by-face`** usa el **mismo** `/identify` pero NO crea sesión (solo
  busca). La detección debe activarse solo en logins reales.
- **Auditoría (Python, HexCore):** entidad `BiometricAuditLog`, repo
  `BiometricAuditLogRepository` (`SQLAlchemyCommonImplementationsRepo`), caso de uso
  `LogBiometricEventUseCase`, y `ListAuditLogsUseCase` (query). Tabla
  `biometric_audit_log` migrada por Alembic.
- **tRPC `auditRouter.list`** (`packages/api/src/routers/audit.ts`) ya consume
  `GET /v1/audit` del servicio Python usando `INTERNAL_API_KEY`.
- **Infra:** `INTERNAL_API_KEY` compartida entre `server`, `web` y `biometric-api`.
  El rol admin ya existe en ambos lados (`require_admin` en Python; Better-Auth en TS).
  Consola admin en la web (`apps/web/src/routes/admin.tsx`).
- **Captura en web:** `useCamera` / `useFaceCaptureFlow` producen
  `{ imageBase64, mimeType: "image/jpeg" }`, que el plugin convierte a `Blob`.

## 3. Decisiones de diseño (cerradas)

| Tema | Decisión |
| :--- | :--- |
| Acción ante sospecha | Permitir + auditar + guardar foto + notificar. **Nunca bloquear.** |
| Método estadístico | **Estadística circular (von Mises)**, z-score sobre distancia angular. |
| Dónde corre la detección | Servicio **Python** (tiene historial, embedding y bytes de la foto). |
| Cuándo corre | **`BackgroundTask` de FastAPI** tras responder el login (no bloquea ni demora). |
| Foto | **SeaweedFS** vía API HTTP del filer; solo se guarda en intentos sospechosos. |
| Notificación | **SSE** (admin conectado) + **Web Push** (fallback). |
| Señalización Python→TS | **Callback HTTP** a un endpoint interno del server Hono (Bearer `INTERNAL_API_KEY`). |
| Almacenamiento del evento | Reutiliza la tabla `biometric_audit_log` (sin tabla nueva en Python). |

## 4. Flujo general

```
1. authenticate-face llama a /identify con purpose="login"
   (search-user-by-face NO envía purpose=login → no activa detección)
2. /identify hace el match y RESPONDE de inmediato (login sin cambios)
3. Si hubo match Y purpose="login": se encola un BackgroundTask:
     a. Lee el historial de horas del usuario (biometric_access_granted, últimos N días)
     b. LoginTimePatternService evalúa la anomalía (von Mises z-score)
     c. Si NO es sospechoso → fin (no se guarda foto)
     d. Si es sospechoso:
          - sube la foto a SeaweedFS → key
          - registra "biometric_suspicious_login" (score, razón, key, hora, IP, UA)
          - callback HTTP al server Hono: POST /internal/alerts/suspicious-login
4. Server Hono: difunde por SSE a admins conectados + Web Push a suscripciones guardadas
5. Web admin: toast en vivo (SSE) y/o notificación push; vista de alertas con la foto
```

Garantía: el `BackgroundTask` corre **después** de responder y va envuelto en
`try/except`. Cualquier fallo (detección, SeaweedFS, callback) se loguea pero **nunca**
afecta al login.

## 5. Componentes

### 5.1 Detección (Python / HexCore) — respeta capas hexagonales

**Dominio — `LoginTimePatternService` (`BaseDomainService`, lógica pura):**

- Entrada: `history: list[datetime]` (o lista de horas decimales) + `attempt: datetime`.
- Mapea cada hora a un ángulo: `θ = 2π · (hora + minuto/60) / 24`.
- Calcula:
  - `C = mean(cos θ)`, `S = mean(sin θ)`
  - `R = sqrt(C² + S²)` (concentración: 0 disperso, 1 concentrado)
  - `μ = atan2(S, C)` (hora media)
  - `σ = sqrt(-2 · ln R)` (desviación circular; en radianes)
  - `d = atan2(sin(θ_attempt − μ), cos(θ_attempt − μ))` (distancia angular con signo)
- Devuelve `AnomalyResult { is_suspicious, score, mean_hour, sigma_hours, resultant_R, sample_size, reason }`.
  - `score = |d| / σ` (z-score). `sigma_hours = σ · 24 / (2π)` para legibilidad.
- **Guardas anti-falsos-positivos:**
  - Si `sample_size < ANOMALY_MIN_SAMPLES` → `is_suspicious = False` (cold start).
  - Si `R < ANOMALY_MIN_R` → `is_suspicious = False` (sin patrón consistente).
  - En otro caso, `is_suspicious = (|d| > ANOMALY_K · σ)`.
- **Implementación:** numpy (ya instalado). Sin dependencias nuevas.

**Aplicación — `EvaluateLoginAnomalyUseCase`:** orquesta, no contiene lógica de negocio.
Depende de **puertos** (interfaces de dominio), no de infra concreta:

- `ILoginHistoryReader` — `get_login_times(user_id, since) -> list[datetime]`.
- `ISuspiciousPhotoStorage` — `save(user_id, image_bytes) -> key`.
- `ISuspiciousLoginNotifier` — `notify(payload) -> None`.
- Logger de auditoría: reutiliza `LogBiometricEventUseCase` / repo de auditoría.

Pasos: leer historial → `LoginTimePatternService.evaluate(...)` → si sospechoso: guardar
foto, registrar evento de auditoría, notificar.

**Infra — adaptadores de los puertos:**

- Historial: query SQLAlchemy sobre `biometric_audit_log` (filtra
  `action = 'biometric_access_granted'`, `user_id`, `created_at >= since`).
- Foto: cliente SeaweedFS (ver 5.2).
- Notificador: `httpx` POST al server Hono (ver 5.3).

**Integración con `/identify`:**

- Añadir campo de formulario opcional `purpose: str = Form("identify")` al endpoint
  `/identify`. El handler `authenticateFaceHandler` del plugin envía `purpose=login`;
  `searchUserByFaceHandler` no.
- Tras un match con `purpose=login`, encolar el `EvaluateLoginAnomalyUseCase` vía
  `BackgroundTasks`, pasándole `user_id`, `image_bytes`, `ip`, `user_agent`.
- El evento sospechoso se escribe en `biometric_audit_log` con
  `action = "biometric_suspicious_login"` y `details = { score, reason, mean_hour,
  sigma_hours, resultant_R, sample_size, login_hour, photo_key, ip, user_agent }`.

**Parámetros (env, con defaults):**

| Var | Default | Significado |
| :--- | :--- | :--- |
| `ANOMALY_MIN_SAMPLES` | 20 | Mínimo de logins históricos para activar la detección. |
| `ANOMALY_K` | 2.0 | Umbral z-score (cuántas σ para marcar sospechoso). |
| `ANOMALY_MIN_R` | 0.35 | Concentración mínima del patrón para activar. |
| `ANOMALY_HISTORY_DAYS` | 90 | Ventana de historial considerada. |

### 5.2 Almacenamiento de fotos (SeaweedFS)

- Nuevo servicio `seaweedfs` en `docker-compose` con volumen persistente.
- Acceso vía **API HTTP del filer** (PUT/GET simple, sin boto3):
  - Guardar: `PUT {SEAWEEDFS_URL}/suspicious/{user_id}/{timestamp}.jpg` con los bytes.
  - En auditoría se guarda solo la **`key`** (p.ej. `suspicious/{user_id}/{ts}.jpg`),
    no una URL pública. SeaweedFS queda en la red interna de Docker.
- **Servir al navegador del admin** mediante proxy en el server Hono:
  `GET /media/suspicious/*` (protegido, solo admin) → stream desde
  `{SEAWEEDFS_URL}/...`. SeaweedFS nunca se expone fuera de la red interna.

### 5.3 Notificación (TS: server Hono + web)

**Server Hono (`apps/server`):**

- `GET /sse/admin-alerts` — stream SSE, **protegido** (sesión admin). Mantiene un *hub*
  en memoria con las conexiones admin activas.
- `POST /internal/alerts/suspicious-login` — entrada interna; valida
  `INTERNAL_API_KEY` (mismo patrón que `/v1/audit/login-event` en sentido inverso).
  Al recibir el payload:
  1. Difunde el evento a los clientes SSE conectados.
  2. Envía Web Push a todas las suscripciones guardadas (lib `web-push` + VAPID).
- `GET /media/suspicious/*` — proxy de foto (protegido admin), ver 5.2.

**Web (consola admin):**

- **SSE:** `EventSource` al stream → toast en vivo + se antepone a la lista de alertas.
- **Web Push:** service worker registrado; el admin concede permiso → se suscribe →
  la suscripción se guarda vía mutación tRPC. El SW maneja el evento `push` mostrando
  la notificación aunque el dashboard esté cerrado; al hacer clic abre la vista de
  alertas.
- **Vista de alertas sospechosas:** lista los eventos `biometric_suspicious_login`
  (foto vía `/media/...`, hora, score, razón, IP/UA). Reutiliza el flujo de auditoría
  existente filtrando por `action`.

**DB (Drizzle, migrado por TS — `packages/db/src/schema/`):** nueva tabla
`push_subscription`:

| Columna | Tipo | Nota |
| :--- | :--- | :--- |
| `id` | text PK | |
| `userId` | text FK → `user.id` (`onDelete: cascade`) | admin suscrito |
| `endpoint` | text not null | endpoint push del navegador |
| `p256dh` | text not null | clave pública de la suscripción |
| `auth` | text not null | secreto de auth de la suscripción |
| `createdAt` | timestamp defaultNow not null | |

Re-exportar desde `packages/db/src/schema/index.ts`.

**tRPC:** router `pushSubscriptions` con `subscribe` / `unsubscribe`
(`protectedProcedure`), que escribe/borra en `push_subscription`.

## 6. Configuración / Infra nueva

- **`docker-compose.yml`:** servicio `seaweedfs` (+ volumen); inyectar `SEAWEEDFS_URL`
  a `server` y `biometric-api`; inyectar `SERVER_INTERNAL_URL` (base del callback Hono)
  a `biometric-api`; inyectar VAPID a `server` y `web`.
- **Python `config.py`:** `seaweedfs_url`, `server_internal_url`, y los 4 params de
  anomalía (`ANOMALY_*`).
- **`packages/env/src/server.ts`:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `SEAWEEDFS_URL`.
- **Web env:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **`.env.example`:** documentar todas las variables nuevas.

## 7. Manejo de errores

- Detección/foto/notificación en `BackgroundTask` con `try/except`: se loguea, nunca
  afecta al login.
- Callback Hono caído → Python loguea warning; el evento ya quedó auditado y es
  consultable (la alerta en vivo se pierde, no el registro).
- SeaweedFS caído → se registra el evento sin `photo_key` (campo opcional); la alerta
  indica "foto no disponible".
- Web Push: suscripciones con `410 Gone`/`404` se eliminan de `push_subscription`.
- Endpoint interno y SSE rechazan sin credenciales válidas (`INTERNAL_API_KEY` / sesión
  admin).

## 8. Pruebas

- **Python (prioritario):** tests unitarios deterministas de `LoginTimePatternService`:
  - cold start (`sample_size < N` → no marca),
  - patrón disperso (`R < piso` → no marca),
  - outlier claro (3am contra patrón de 9am → marca),
  - envoltura de medianoche (23:30 vs 00:30 → **no** marca),
  - z-score en el borde de `K`.
- **TS:** unit del hub SSE (broadcast a N clientes), guardado/borrado de suscripción
  push, auth del endpoint interno (`INTERNAL_API_KEY`), poda de suscripciones caducadas.

## 9. Orden de construcción (incremental, cada fase aporta valor)

1. **Detección + auditoría** (Python): domain service + use case + puertos + integración
   en `/identify` con `purpose`. Deja registro consultable de logins sospechosos.
2. **Foto en SeaweedFS** + proxy `/media` en Hono.
3. **Alertas en vivo:** hub SSE en Hono + endpoint interno + vista admin con `EventSource`.
4. **Web Push:** service worker + VAPID + tabla `push_subscription` + router tRPC +
   envío desde el endpoint interno.

## 10. Archivos afectados (referencia, no exhaustivo)

- **Python:** `features/biometrics/{domain,application,infrastructure}` (nuevo domain
  service, use case, puertos, adaptadores; `purpose` en `api.py`); `config.py`;
  nueva migración Alembic no necesaria (reutiliza tabla existente).
- **TS server:** rutas SSE / interna / media; sender Web Push; integración con el hub.
- **packages:** `db/src/schema/push-subscription.ts` (+ index); `env/src/server.ts`;
  `api/src/routers/pushSubscriptions.ts` (+ index); plugin `auth/src/plugins/biometric.ts`
  (`purpose=login`).
- **Web:** service worker, suscripción push, cliente SSE, vista de alertas en la consola
  admin.
- **Infra:** `docker-compose.yml`, `.env.example`.
