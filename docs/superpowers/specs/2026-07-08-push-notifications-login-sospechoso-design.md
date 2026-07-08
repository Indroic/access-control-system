# Diseño — Notificaciones Push (self-hosted) para logins biométricos sospechosos

- **Fecha:** 2026-07-08
- **Estado:** Aprobado (pendiente de plan de implementación)
- **Autor:** David (con Claude)
- **Relación con spec previo:** `2026-06-28-deteccion-login-biometrico-sospechoso-design.md`
  aprobó un diseño de 4 fases (detección, fotos en SeaweedFS, alertas SSE, Web Push).
  Solo la **Fase 1 (detección + auditoría)** se implementó y mergeó
  (`b4e4f24 merge: Fase 1 detección de logins biométricos sospechosos`). Este documento
  **reemplaza únicamente la Fase 4 (Web Push)** de aquel spec con un diseño más acotado
  y ajustado a decisiones nuevas (ver sección 1). **Las fases 2 (fotos SeaweedFS) y 3
  (hub SSE) siguen sin implementarse y quedan fuera de alcance de este trabajo.**

## 1. Objetivo y decisiones cerradas

Cuando `EvaluateLoginAnomalyUseCase` (ya implementado, `apps/biometric-api`) marca un
login como sospechoso, además de auditar (ya ocurre hoy), se debe **alertar en tiempo
real** a quienes pueden actuar sobre ello — sin depender de ningún proveedor externo
(Firebase, OneSignal, Pusher, etc.).

| Tema | Decisión |
| :--- | :--- |
| Mecanismo | **Web Push (VAPID)** — estándar de navegador, self-hosted de punta a punta salvo el servicio push del propio navegador del usuario (inherente al estándar, no evitable). |
| Destinatarios | Usuarios con rol **`admin`, `gerente` o `jefe`** (roles ya existentes, ver `apps/web/src/routes/admin.tsx`). |
| Quién posee la lógica de envío | **Node (Hono)** — guarda suscripciones, claves VAPID, y envía con `web-push`. |
| Cómo se entera Python | Llamada HTTP interna, fire-and-forget, autenticada con `INTERNAL_API_KEY` (secreto ya existente y compartido). |
| Registro histórico | El audit log (`biometric_suspicious_login`, ya existe) sigue siendo la fuente de verdad. El push es solo la alerta en tiempo real — no hay tabla de "notificaciones enviadas" ni inbox in-app nuevo. |

### No-objetivos (YAGNI)

- Fotos del intento sospechoso (SeaweedFS) — Fase 2 del spec anterior, no incluida aquí.
- Hub SSE de alertas en vivo para admins conectados — Fase 3 del spec anterior, no
  incluida aquí (la consola admin ya tiene su propio SSE de refresco de tabla,
  `/api/sse/live-updates`, sin relación con esto).
- Sistema de notificaciones genérico para otros tipos de evento.
- Inbox de notificaciones in-app (el audit log ya cumple ese rol).
- Reintentos con cola persistente / poller (se evaluó y se descartó por sobre-ingeniería
  para un evento de baja frecuencia).

## 2. Contexto actual (lo que ya existe)

- `EvaluateLoginAnomalyUseCase` (`apps/biometric-api/src/features/anomaly/application/use_cases.py:17`)
  evalúa la anomalía y, si `is_suspicious`, registra `biometric_suspicious_login` vía
  `IAuditEventLogger`. No notifica a nadie todavía.
- `run_login_anomaly_detection` (`.../infrastructure/tasks.py:30`) construye y ejecuta
  el use case como `BackgroundTask`, envuelto en `try/except` — "la detección jamás debe
  afectar el login". Este principio se extiende a la notificación.
- `INTERNAL_API_KEY` ya es un secreto compartido entre `server`, `web` y `biometric-api`
  (ver `packages/env/src/server.ts` y `apps/biometric-api/config.py:89`), usado hoy para
  llamadas Node→Python. Se reutiliza sin cambios para la llamada Python→Node de este
  diseño.
- El servidor Hono (`apps/server/src/index.ts`) ya expone rutas planas fuera de tRPC
  con el mismo patrón de secreto compartido (`/api/setup-admin` con
  `ADMIN_SETUP_SECRET`) — se sigue ese mismo estilo para el endpoint interno nuevo.
- La consola admin (`apps/web/src/routes/admin.tsx`) ya tiene una pestaña de auditoría
  que lista todos los eventos, incluido `biometric_suspicious_login` — sirve como
  registro histórico, no hace falta duplicarlo.
- Variables de entorno ya añadidas a `.env.example`, `docker-compose.yml` y
  `docker-compose.webapp.yml` (este mismo trabajo, commit previo): `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SERVER_INTERNAL_URL`.

## 3. Flujo general

```
[Admin/Gerente/Jefe en apps/web]
   → Activa alertas → Service Worker (push-sw.js) → PushManager.subscribe()
   → trpc.notifications.subscribe → guarda en Postgres (tabla push_subscription)

[biometric-api detecta login sospechoso]
   → EvaluateLoginAnomalyUseCase (ya existe, registra auditoría)
   → nuevo: HttpAdminNotifier.execute() → POST interno a Hono
        (header x-internal-api-key = INTERNAL_API_KEY)
   → Hono: lee suscripciones de usuarios con rol admin/gerente/jefe
   → web-push.sendNotification() a cada una
   → limpia suscripciones expiradas (404/410) automáticamente
```

Garantía: igual que la detección, el envío de push nunca debe afectar el login ni la
detección misma. Todo el camino Python→Node está envuelto en manejo de errores que
solo loguea, nunca propaga.

## 4. Modelo de datos

Nuevo archivo `packages/db/src/schema/notifications.ts`, re-exportado desde
`schema/index.ts` (sigue la guía de CLAUDE.md: cualquier cosa más allá de estado
auth-adjacent va en un schema nuevo, no se extiende la tabla `user`):

```ts
export const pushSubscription = pgTable("push_subscription", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

`endpoint` es único: una re-suscripción del mismo navegador/dispositivo hace upsert en
vez de duplicar filas.

## 5. Backend Node (Hono + tRPC)

**Router tRPC** `packages/api/src/routers/notifications.ts`:

- `subscribe` (`protectedProcedure`): valida que `ctx.session.user.role` esté en
  `["admin", "gerente", "jefe"]` (si no, `FORBIDDEN`); upsert por `endpoint`.
- `unsubscribe` (`protectedProcedure`): borra la suscripción del usuario actual por
  `endpoint`.
- `getVapidPublicKey` (`protectedProcedure`): devuelve la clave pública VAPID desde
  `env.VAPID_PUBLIC_KEY`. Se prefiere este fetch dinámico sobre duplicar la clave como
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (como sugería el spec anterior): una sola fuente de
  verdad en `server.ts`, sin sincronizar dos env vars.

**Endpoint interno**, ruta plana en `apps/server/src/index.ts` (mismo estilo que
`/api/setup-admin`):

```
POST /api/internal/notifications/suspicious-login
Header: x-internal-api-key: <INTERNAL_API_KEY>
Body: { userId, ip, userAgent, score, reason, loginHour, occurredAt }
```

`userId` es el id del usuario cuyo login se marcó sospechoso — Python solo tiene ese id
(`EvaluateLoginAnomalyCommand` no incluye nombre). Node ya consulta la tabla `user` para
filtrar suscriptores por rol, así que reutiliza esa misma consulta para resolver el
nombre a mostrar en el cuerpo de la notificación (`user.name` por `userId`).

Lógica: 401 si el header no coincide con `env.INTERNAL_API_KEY` → resuelve el nombre del
usuario sospechoso por `userId` → consulta `push_subscription` join `user` filtrando por
rol en `["admin", "gerente", "jefe"]` → `webpush.sendNotification()` a cada una en
paralelo → si una falla con 404/410 (Gone/expirada), se borra esa fila; otros errores
solo se loguean, no tumban el resto del batch.

**Env vars** (ya añadidas en `packages/env/src/server.ts`): `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Se reutiliza `INTERNAL_API_KEY` existente para la
autenticación del endpoint — sin nuevo secreto.

## 6. Backend Python (`apps/biometric-api`)

**Nuevo puerto** en `anomaly/domain/ports.py`, junto a `IAuditEventLogger`:

```python
class IAdminNotifier(ABC):
    @abstractmethod
    async def execute(self, command: object) -> None:
        raise NotImplementedError
```

**Nuevo adaptador** `anomaly/infrastructure/notifiers.py`:

```python
class HttpAdminNotifier(IAdminNotifier):
    """POST interno a Hono. Nunca propaga errores — el push es best-effort."""

    async def execute(self, command: NotifySuspiciousLoginCommand) -> None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{config.server_internal_url}/api/internal/notifications/suspicious-login",
                    headers={"x-internal-api-key": config.internal_api_key},
                    json=command.model_dump(mode="json"),
                )
        except Exception:
            logger.warning("Fallo al notificar login sospechoso:\n%s", traceback.format_exc())
```

- Nuevo campo en `config.py`: `server_internal_url` (alias `SERVER_INTERNAL_URL`,
  default `http://localhost:3000`) — env var ya añadida en docker-compose/.env.example.
- **Wiring:** `EvaluateLoginAnomalyUseCase` recibe `notifier: IAdminNotifier` opcional
  en el constructor; tras registrar el evento de auditoría, si `result.is_suspicious`,
  llama a `notifier.execute(...)` con los mismos datos del audit log.
  `run_login_anomaly_detection` construye `HttpAdminNotifier()` y lo inyecta — mismo
  patrón que ya usa para `audit_logger`.
- El `try/except` externo que ya existe en `run_login_anomaly_detection` sigue siendo
  la red de seguridad final; el adaptador además loguea sus propios errores con
  contexto específico de notificación.

## 7. Frontend (`apps/web`)

**Service Worker** — nuevo `apps/web/public/push-sw.js` (archivo estático):

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Alerta de seguridad", {
      body: data.body,
      icon: "/logo192.png",
      data: data.data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/admin"));
});
```

**Hook** `apps/web/src/hooks/use-push-notifications.ts`: registra `push-sw.js`, pide
`Notification.requestPermission()`, obtiene la clave pública vía
`trpc.notifications.getVapidPublicKey`, se suscribe con
`PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, persiste con
`trpc.notifications.subscribe.mutate(subscription.toJSON())`. Expone
`{ isSubscribed, subscribe, unsubscribe }`.

**UI:** toggle simple ("Activar alertas de seguridad") en `admin.tsx`, visible solo si
`session.user.role` está en `["admin", "gerente", "jefe"]` — el chequeo real de
autorización vive server-side en el procedure `subscribe`; esto es solo para no mostrar
el control a quien no lo puede usar.

No se toca `manifest.json` (boilerplate sin relación con Web Push) ni se añade
instalabilidad PWA — fuera de alcance.

## 8. Seguridad y resiliencia

- El endpoint interno nunca se expone públicamente en el reverse proxy (mismo criterio
  que `/api/setup-admin`): valida `x-internal-api-key` y responde 401 si no coincide.
- La clave privada VAPID solo vive en el servicio `server` (Node) — Python nunca la ve,
  solo llama al endpoint interno.
- `notifications.subscribe`/`unsubscribe` son `protectedProcedure`; el rol se revalida
  server-side, no solo en la UI.
- El audit log sigue siendo la fuente de verdad; el push es una capa adicional no
  crítica. Si `server` está caído cuando Python intenta notificar, el `httpx` con
  timeout de 3s falla silenciosamente (logueado) — el login y el audit log no se ven
  afectados.
- Suscripciones que devuelven 404/410 se borran automáticamente al intentar enviarles
  un push.

## 9. Pruebas

- **Python:** unit test de `HttpAdminNotifier` (mock de `httpx.AsyncClient`)
  verificando payload y que excepciones no propagan; unit test de
  `EvaluateLoginAnomalyUseCase` verificando que se llama al notifier solo cuando
  `is_suspicious=True`.
- **Node:** unit test del endpoint interno — rechazo sin header válido, fan-out a
  múltiples suscripciones, limpieza de suscripción en 410.
- **Manual:** suscribirse desde el navegador (dev tools), forzar una anomalía de
  prueba, confirmar que llega la notificación del sistema operativo.

## 10. Archivos afectados (referencia, no exhaustivo)

- **Python:** `features/anomaly/domain/ports.py` (nuevo puerto `IAdminNotifier`),
  `features/anomaly/infrastructure/notifiers.py` (nuevo), `features/anomaly/application/use_cases.py`
  (wiring), `features/anomaly/infrastructure/tasks.py` (wiring), `config.py`
  (`server_internal_url`).
- **packages:** `db/src/schema/notifications.ts` (+ `schema/index.ts`),
  `api/src/routers/notifications.ts` (+ `routers/index.ts`).
- **apps/server:** `src/index.ts` (endpoint interno nuevo), instalar dependencia
  `web-push`.
- **apps/web:** `public/push-sw.js` (nuevo), `src/hooks/use-push-notifications.ts`
  (nuevo), `src/routes/admin.tsx` (toggle de suscripción).
- **Infra:** `.env.example`, `docker-compose.yml`, `docker-compose.webapp.yml` (ya
  actualizados en este trabajo).
