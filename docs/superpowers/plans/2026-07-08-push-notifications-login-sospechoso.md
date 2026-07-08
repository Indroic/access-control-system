# Notificaciones Push (self-hosted) para logins sospechosos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando `EvaluateLoginAnomalyUseCase` (ya implementado) marca un login biométrico
como sospechoso, enviar una notificación Web Push (VAPID, self-hosted, sin
Firebase/OneSignal) a los usuarios con rol `admin`, `gerente` o `jefe`.

**Architecture:** Node (`apps/server`) posee las suscripciones push, las claves VAPID y
el envío (`web-push`). Python (`apps/biometric-api`) solo dispara un POST interno
fire-and-forget autenticado con el `INTERNAL_API_KEY` ya existente. El audit log
(`biometric_suspicious_login`, ya implementado) sigue siendo la fuente de verdad; el
push es una alerta en tiempo real adicional, no crítica.

**Tech Stack:** TypeScript (Hono, tRPC, Drizzle ORM, `web-push`, Vitest), Python
(FastAPI/HexCore, `httpx`, pytest), Web Push API nativo del navegador (Service Worker +
`PushManager`).

## Global Constraints

- Nunca bloquear ni ralentizar el login por un fallo de notificación — todo el camino
  Python→Node debe loguear y tragarse errores, jamás propagarlos (mismo principio que
  ya aplica `run_login_anomaly_detection`).
- Reutilizar `INTERNAL_API_KEY` (ya existe en ambos servicios) para autenticar el
  endpoint interno — no crear un secreto nuevo.
- Roles con acceso a las alertas: exactamente `["admin", "gerente", "jefe"]` (no
  `"user"`).
- Sin fotos (SeaweedFS) ni hub SSE de alertas — fuera de alcance de este plan (ver spec
  `docs/superpowers/specs/2026-07-08-push-notifications-login-sospechoso-design.md`,
  sección "No-objetivos").
- Sin nueva tabla de "notificaciones enviadas" ni inbox in-app — el audit log ya
  existente cubre el historial.

---

### Task 1: Declarar las env vars VAPID en `packages/env`

Las variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` ya están en
`.env.example` y en los `docker-compose*.yml` (trabajo previo), pero `@t3-oss/env-core`
lanza un error al arrancar si se lee `env.VAPID_PUBLIC_KEY` sin declararlo antes en el
esquema Zod. Este task lo cierra.

**Files:**
- Modify: `packages/env/src/server.ts`

**Interfaces:**
- Produces: `env.VAPID_PUBLIC_KEY: string`, `env.VAPID_PRIVATE_KEY: string`,
  `env.VAPID_SUBJECT: string` — usados por Task 4 (endpoint interno) y Task 5 (router
  tRPC).

- [ ] **Step 1: Añadir los campos al esquema**

En `packages/env/src/server.ts`, dentro de `server: { ... }`, después de
`INTERNAL_API_KEY`:

```ts
		INTERNAL_API_KEY: z
			.string()
			.default("change-me-to-a-safe-internal-secret-key-12345!!"),
		VAPID_PUBLIC_KEY: z
			.string()
			.default(
				"BMRqLkyQkQJwuYsobpLcURXWHe7wZs0oFQ4kmmmmR2AgGceh4E-v9sZeCequheux6NOu-sSV4xHRFWSvDQ_44R0",
			),
		VAPID_PRIVATE_KEY: z
			.string()
			.default("adFa0rhRonWnPMak2EPDtWj7l1GZQUeuOLYcv2QiM9g"),
		VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
```

- [ ] **Step 2: Verificar que el módulo carga sin errores**

Run: `pnpm --filter @access-control-system/env exec tsx -e "import('./src/server.ts').then(m => console.log(m.env.VAPID_PUBLIC_KEY, m.env.VAPID_SUBJECT))"`

Expected: imprime la clave pública y `mailto:admin@example.com` sin lanzar excepción.

- [ ] **Step 3: Commit**

```bash
git add packages/env/src/server.ts
git commit -m "feat(env): declarar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT"
```

---

### Task 2: Tabla `push_subscription` (Drizzle)

**Files:**
- Create: `packages/db/src/schema/notifications.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Produces: `pushSubscription` (Drizzle table, columnas `id`, `userId`, `endpoint`
  único, `p256dh`, `auth`, `createdAt`) — usado por Task 4 y Task 5.

- [ ] **Step 1: Crear el schema**

`packages/db/src/schema/notifications.ts`:

```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const pushSubscription = pgTable("push_subscription", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	endpoint: text("endpoint").notNull().unique(),
	p256dh: text("p256dh").notNull(),
	auth: text("auth").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Re-exportar desde el índice del schema**

`packages/db/src/schema/index.ts`:

```ts
export * from "./audit";
export * from "./auth";
export * from "./notifications";
```

- [ ] **Step 3: Sincronizar el esquema con Postgres**

Requiere Postgres local corriendo (`pnpm db:start` si no está arriba).

Run: `pnpm db:push`

Expected: la CLI de `drizzle-kit` reporta la creación de la tabla `push_subscription`
sin errores (responder "Yes" si pregunta por confirmación de cambios nuevos, ya que es
una tabla nueva sin datos que perder).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/notifications.ts packages/db/src/schema/index.ts
git commit -m "feat(db): tabla push_subscription para notificaciones Web Push"
```

---

### Task 3: `notifySuspiciousLogin` — envío + limpieza de suscripciones (Node, TDD)

Función pura inyectable (sin tocar la DB directamente) que hace el fan-out del push y
decide qué suscripciones borrar. Se prueba con fakes, sin necesitar Postgres real ni un
servidor HTTP.

**Files:**
- Create: `apps/server/src/notifications/suspicious-login-notifier.ts`
- Test: `apps/server/src/notifications/suspicious-login-notifier.test.ts`
- Create: `apps/server/vitest.config.ts`
- Modify: `apps/server/package.json`

**Interfaces:**
- Produces: `notifySuspiciousLogin(params): Promise<{ sent: number; removed: number }>`,
  tipos `PushSubscriptionRow`, `SuspiciousLoginPayload`, `WebPushClient` — usados por
  Task 4.

- [ ] **Step 1: Añadir Vitest y `web-push` a `apps/server`**

Run:
```bash
pnpm --filter server add web-push
pnpm --filter server add -D vitest @types/web-push
```

En `apps/server/package.json`, añadir el script de test junto a los existentes:

```json
	"scripts": {
		"build": "tsdown",
		"check-types": "tsc -b",
		"compile": "bun build --compile --minify --sourcemap --bytecode ./src/index.ts --outfile server",
		"dev": "tsx watch src/index.ts",
		"start": "node dist/index.mjs",
		"test": "vitest run"
	},
```

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
	},
});
```

- [ ] **Step 2: Escribir el test que falla**

`apps/server/src/notifications/suspicious-login-notifier.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { notifySuspiciousLogin } from "./suspicious-login-notifier";

function makeSubscription(id: string) {
	return { id, endpoint: `https://push.example/${id}`, p256dh: "p256dh", auth: "auth" };
}

const basePayload = {
	userId: "u1",
	userName: null as string | null,
	ip: null as string | null,
	userAgent: null as string | null,
	score: 3.2,
	reason: "unusual_hour",
	loginHour: 3,
	occurredAt: "2026-01-01T03:00:00.000Z",
};

describe("notifySuspiciousLogin", () => {
	it("sends a push to every subscription", async () => {
		const sendNotification = vi.fn().mockResolvedValue(undefined);
		const onExpired = vi.fn().mockResolvedValue(undefined);

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a"), makeSubscription("b")],
			webpush: { sendNotification },
			payload: { ...basePayload, userName: "Ada" },
			onExpired,
		});

		expect(sendNotification).toHaveBeenCalledTimes(2);
		expect(onExpired).not.toHaveBeenCalled();
		expect(result).toEqual({ sent: 2, removed: 0 });
	});

	it("removes subscriptions that respond with 410 Gone", async () => {
		const sendNotification = vi.fn().mockRejectedValue({ statusCode: 410 });
		const onExpired = vi.fn().mockResolvedValue(undefined);

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a")],
			webpush: { sendNotification },
			payload: basePayload,
			onExpired,
		});

		expect(onExpired).toHaveBeenCalledWith("a");
		expect(result).toEqual({ sent: 0, removed: 1 });
	});

	it("keeps sending to remaining subscriptions when one fails with a non-expiry error", async () => {
		const sendNotification = vi
			.fn()
			.mockRejectedValueOnce({ statusCode: 500 })
			.mockResolvedValueOnce(undefined);
		const onExpired = vi.fn().mockResolvedValue(undefined);

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a"), makeSubscription("b")],
			webpush: { sendNotification },
			payload: basePayload,
			onExpired,
		});

		expect(onExpired).not.toHaveBeenCalled();
		expect(result).toEqual({ sent: 1, removed: 0 });
	});
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `pnpm --filter server exec vitest run src/notifications/suspicious-login-notifier.test.ts`

Expected: FAIL — `Cannot find module './suspicious-login-notifier'`.

- [ ] **Step 4: Implementación mínima**

`apps/server/src/notifications/suspicious-login-notifier.ts`:

```ts
export type PushSubscriptionRow = {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
};

export type SuspiciousLoginPayload = {
	userId: string;
	userName: string | null;
	ip: string | null;
	userAgent: string | null;
	score: number;
	reason: string;
	loginHour: number;
	occurredAt: string;
};

export type WebPushClient = {
	sendNotification: (
		subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
		payload: string,
	) => Promise<unknown>;
};

export async function notifySuspiciousLogin(params: {
	subscriptions: PushSubscriptionRow[];
	webpush: WebPushClient;
	payload: SuspiciousLoginPayload;
	onExpired: (subscriptionId: string) => Promise<void>;
}): Promise<{ sent: number; removed: number }> {
	const { subscriptions, webpush, payload, onExpired } = params;

	const notificationPayload = JSON.stringify({
		title: "Login biométrico sospechoso",
		body: `${payload.userName ?? payload.userId} inició sesión a una hora inusual (score ${payload.score.toFixed(2)}).`,
		data: {
			userId: payload.userId,
			occurredAt: payload.occurredAt,
			action: "biometric_suspicious_login",
		},
	});

	let sent = 0;
	let removed = 0;

	await Promise.all(
		subscriptions.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					notificationPayload,
				);
				sent += 1;
			} catch (error) {
				const statusCode = (error as { statusCode?: number })?.statusCode;
				if (statusCode === 404 || statusCode === 410) {
					await onExpired(sub.id);
					removed += 1;
				} else {
					console.error("Fallo al enviar push a", sub.endpoint, error);
				}
			}
		}),
	);

	return { sent, removed };
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `pnpm --filter server exec vitest run src/notifications/suspicious-login-notifier.test.ts`

Expected: PASS — 3 tests verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/vitest.config.ts apps/server/src/notifications/
git commit -m "feat(server): notifySuspiciousLogin con fan-out y limpieza de suscripciones expiradas"
```

---

### Task 4: Endpoint interno `/api/internal/notifications/suspicious-login`

**Files:**
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `notifySuspiciousLogin` (Task 3), `pushSubscription` (Task 2),
  `env.VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` (Task 1).
- Produces: `POST /api/internal/notifications/suspicious-login` — usado por el
  `HttpAdminNotifier` de Python (Task 6/7).

- [ ] **Step 1: Añadir imports y setup de VAPID**

En `apps/server/src/index.ts`, ampliar los imports existentes:

```ts
import { and, eq, gt, inArray } from "drizzle-orm";
```

y añadir, junto a los otros imports de paquetes del monorepo:

```ts
import { pushSubscription } from "@access-control-system/db/schema/notifications";
import webpush from "web-push";
import { notifySuspiciousLogin } from "./notifications/suspicious-login-notifier";
```

Después de `const app = new Hono();`, antes del middleware de `cors`:

```ts
webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
```

- [ ] **Step 2: Añadir la ruta**

Insertar después del handler `app.post("/api/setup-admin", ...)` existente (antes del
montaje de `/api/trpc/*`):

```ts
const suspiciousLoginSchema = z.object({
	userId: z.string(),
	ip: z.string().nullable().optional(),
	userAgent: z.string().nullable().optional(),
	score: z.number(),
	reason: z.string(),
	loginHour: z.number(),
	occurredAt: z.string(),
});

app.post("/api/internal/notifications/suspicious-login", async (c) => {
	if (c.req.header("x-internal-api-key") !== env.INTERNAL_API_KEY) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const parsed = suspiciousLoginSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return c.json({ error: "Invalid payload" }, 400);
	}
	const body = parsed.data;

	const db = createDb();

	const [suspiciousUser] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, body.userId))
		.limit(1);

	const subscribers = await db
		.select({
			id: pushSubscription.id,
			endpoint: pushSubscription.endpoint,
			p256dh: pushSubscription.p256dh,
			auth: pushSubscription.auth,
		})
		.from(pushSubscription)
		.innerJoin(user, eq(pushSubscription.userId, user.id))
		.where(inArray(user.role, ["admin", "gerente", "jefe"]));

	const result = await notifySuspiciousLogin({
		subscriptions: subscribers,
		webpush,
		payload: {
			userId: body.userId,
			userName: suspiciousUser?.name ?? null,
			ip: body.ip ?? null,
			userAgent: body.userAgent ?? null,
			score: body.score,
			reason: body.reason,
			loginHour: body.loginHour,
			occurredAt: body.occurredAt,
		},
		onExpired: async (id) => {
			await db.delete(pushSubscription).where(eq(pushSubscription.id, id));
		},
	});

	return c.json({ success: true, ...result });
});
```

- [ ] **Step 3: Verificar manualmente con el servidor en marcha**

Run: `pnpm dev:server`

En otra terminal:
```bash
curl -i -X POST http://localhost:3000/api/internal/notifications/suspicious-login \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: change-me-to-a-safe-internal-secret-key-12345!!" \
  -d '{"userId":"nonexistent","score":3.2,"reason":"unusual_hour","loginHour":3,"occurredAt":"2026-01-01T03:00:00.000Z"}'
```

Expected: `200 OK` con `{"success":true,"sent":0,"removed":0}` (no hay suscripciones
todavía). Repetir sin el header `x-internal-api-key` y confirmar `401`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat(server): endpoint interno para disparar notificaciones de login sospechoso"
```

---

### Task 5: Router tRPC `notifications` (suscripción desde el navegador)

**Files:**
- Create: `packages/api/src/routers/notifications.ts`
- Modify: `packages/api/src/routers/index.ts`

**Interfaces:**
- Consumes: `pushSubscription` (Task 2), `env.VAPID_PUBLIC_KEY` (Task 1).
- Produces: procedures `notifications.getVapidPublicKey`, `notifications.subscribe`,
  `notifications.unsubscribe` — usados por el hook del Task 9 vía
  `/api/trpc/notifications.*`.

No automatizado con tests unitarios: sigue la misma convención ya establecida en
`packages/api/src/routers/users.ts` y `audit.ts` (ambos sin tests, `db = createDb()` a
nivel de módulo, conectando a Postgres real — no hay infraestructura de mocking de DB en
este monorepo). Se verifica manualmente en el Step 3.

**Files:**
- [ ] **Step 1: Crear el router**

`packages/api/src/routers/notifications.ts`:

```ts
import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";
import { pushSubscription } from "@access-control-system/db/schema/notifications";
import { env } from "@access-control-system/env/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const db = createDb();

const ALERT_ROLES = ["admin", "gerente", "jefe"] as const;

const subscriptionInput = z.object({
	endpoint: z.string().url(),
	keys: z.object({
		p256dh: z.string(),
		auth: z.string(),
	}),
});

export const notificationsRouter = router({
	getVapidPublicKey: protectedProcedure.query(() => {
		return { publicKey: env.VAPID_PUBLIC_KEY };
	}),

	subscribe: protectedProcedure
		.input(subscriptionInput)
		.mutation(async ({ ctx, input }) => {
			const role = ctx.session.user.role ?? "user";
			if (!ALERT_ROLES.includes(role as (typeof ALERT_ROLES)[number])) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Tu rol no puede suscribirse a alertas de seguridad.",
				});
			}

			await db
				.insert(pushSubscription)
				.values({
					userId: ctx.session.user.id,
					endpoint: input.endpoint,
					p256dh: input.keys.p256dh,
					auth: input.keys.auth,
				})
				.onConflictDoUpdate({
					target: pushSubscription.endpoint,
					set: {
						userId: ctx.session.user.id,
						p256dh: input.keys.p256dh,
						auth: input.keys.auth,
					},
				});

			return { success: true };
		}),

	unsubscribe: protectedProcedure
		.input(z.object({ endpoint: z.string().url() }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(pushSubscription)
				.where(
					and(
						eq(pushSubscription.endpoint, input.endpoint),
						eq(pushSubscription.userId, ctx.session.user.id),
					),
				);
			return { success: true };
		}),
});
```

- [ ] **Step 2: Registrar el router**

`packages/api/src/routers/index.ts`:

```ts
import { protectedProcedure, publicProcedure, router } from "../index";
import { auditRouter } from "./audit";
import { doorRouter } from "./door";
import { notificationsRouter } from "./notifications";
import { usersRouter } from "./users";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	users: usersRouter,
	door: doorRouter,
	audit: auditRouter,
	notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verificar manualmente (requiere sesión autenticada)**

Con `pnpm dev:server` corriendo y una sesión de navegador ya logueada como admin en
`http://localhost:3001`, desde la consola del navegador (para reusar la cookie de
sesión):

```js
fetch('/api/trpc/notifications.getVapidPublicKey').then(r => r.json()).then(console.log)
```

Expected: `{"result":{"data":{"publicKey":"BMRqLkyQ..."}}}`.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/notifications.ts packages/api/src/routers/index.ts
git commit -m "feat(api): router tRPC notifications (subscribe/unsubscribe/getVapidPublicKey)"
```

---

### Task 6: Puerto y adaptador HTTP en Python (`IAdminNotifier`, TDD)

**Files:**
- Modify: `apps/biometric-api/src/features/anomaly/domain/ports.py`
- Modify: `apps/biometric-api/src/features/anomaly/application/dtos.py`
- Modify: `apps/biometric-api/config.py`
- Modify: `apps/biometric-api/pyproject.toml`
- Create: `apps/biometric-api/src/features/anomaly/infrastructure/notifiers.py`
- Test: `apps/biometric-api/tests/features/anomaly/test_http_admin_notifier.py`

**Interfaces:**
- Produces: `IAdminNotifier` (puerto), `NotifySuspiciousLoginCommand` (DTO),
  `HttpAdminNotifier` (adaptador) — usados por Task 7.

- [ ] **Step 1: Añadir `httpx` como dependencia**

Run: `cd apps/biometric-api && uv add httpx`

Verifica que `httpx` aparece en `apps/biometric-api/pyproject.toml` bajo
`dependencies` y que `uv.lock` se actualizó.

- [ ] **Step 2: Añadir el puerto `IAdminNotifier`**

En `apps/biometric-api/src/features/anomaly/domain/ports.py`, añadir al final:

```python
class IAdminNotifier(ABC):
    """Puerto: notifica (push) a los administradores sobre un login sospechoso."""

    @abstractmethod
    async def execute(self, command: object) -> None:
        raise NotImplementedError
```

- [ ] **Step 3: Añadir el DTO `NotifySuspiciousLoginCommand`**

En `apps/biometric-api/src/features/anomaly/application/dtos.py`, añadir al final:

```python
class NotifySuspiciousLoginCommand(DTO):
    """Comando para notificar (push) un login biométrico sospechoso."""

    user_id: str
    ip_address: str | None = None
    user_agent: str | None = None
    score: float
    reason: str
    login_hour: float
    occurred_at: datetime
```

- [ ] **Step 4: Añadir `server_internal_url` a la configuración**

En `apps/biometric-api/config.py`, junto a `internal_api_key`:

```python
    # Seguridad / API Interna
    internal_api_key: str = Field(
        default="change-me-to-a-safe-internal-secret-key-12345!!",
        alias="INTERNAL_API_KEY",
    )
    server_internal_url: str = Field(
        default="http://localhost:3000",
        alias="SERVER_INTERNAL_URL",
    )
```

- [ ] **Step 5: Escribir el test que falla**

`apps/biometric-api/tests/features/anomaly/test_http_admin_notifier.py`:

```python
from datetime import datetime, timezone

import httpx
import pytest

from src.features.anomaly.application.dtos import NotifySuspiciousLoginCommand
from src.features.anomaly.infrastructure.notifiers import HttpAdminNotifier


class _FakeResponse:
    def raise_for_status(self) -> None:
        return None


class _FakeAsyncClient:
    instances: list["_FakeAsyncClient"] = []

    def __init__(self, *args, **kwargs) -> None:
        self.calls: list[dict] = []
        _FakeAsyncClient.instances.append(self)

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return _FakeResponse()


class _FailingAsyncClient(_FakeAsyncClient):
    async def post(self, *args, **kwargs):
        raise httpx.ConnectError("boom")


@pytest.fixture(autouse=True)
def _reset_fake_client():
    _FakeAsyncClient.instances.clear()
    yield


def _patch_config(monkeypatch):
    monkeypatch.setattr(
        "src.features.anomaly.infrastructure.notifiers.config.server_internal_url",
        "http://server:3000",
    )
    monkeypatch.setattr(
        "src.features.anomaly.infrastructure.notifiers.config.internal_api_key",
        "secret-key",
    )


async def test_sends_expected_payload(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    _patch_config(monkeypatch)

    notifier = HttpAdminNotifier()
    await notifier.execute(
        NotifySuspiciousLoginCommand(
            user_id="u1",
            ip_address="10.0.0.1",
            user_agent="kiosk",
            score=3.2,
            reason="unusual_hour",
            login_hour=3.0,
            occurred_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
        )
    )

    assert len(_FakeAsyncClient.instances) == 1
    call = _FakeAsyncClient.instances[0].calls[0]
    assert call["url"] == "http://server:3000/api/internal/notifications/suspicious-login"
    assert call["headers"] == {"x-internal-api-key": "secret-key"}
    assert call["json"]["userId"] == "u1"
    assert call["json"]["ip"] == "10.0.0.1"
    assert call["json"]["loginHour"] == 3.0
    assert call["json"]["occurredAt"] == "2026-01-01T03:00:00+00:00"


async def test_swallows_network_errors(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _FailingAsyncClient)
    _patch_config(monkeypatch)

    notifier = HttpAdminNotifier()
    # No debe propagar la excepción — solo loguear.
    await notifier.execute(
        NotifySuspiciousLoginCommand(
            user_id="u1",
            score=3.2,
            reason="unusual_hour",
            login_hour=3.0,
            occurred_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
        )
    )
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_http_admin_notifier.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'src.features.anomaly.infrastructure.notifiers'`.

- [ ] **Step 7: Implementación mínima**

`apps/biometric-api/src/features/anomaly/infrastructure/notifiers.py`:

```python
import logging
import traceback

import httpx

from config import config

from ..application.dtos import NotifySuspiciousLoginCommand
from ..domain.ports import IAdminNotifier

logger = logging.getLogger("anomaly")


class HttpAdminNotifier(IAdminNotifier):
    """POST interno al servidor Hono. Nunca propaga errores — el push es best-effort."""

    async def execute(self, command: NotifySuspiciousLoginCommand) -> None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{config.server_internal_url}/api/internal/notifications/suspicious-login",
                    headers={"x-internal-api-key": config.internal_api_key},
                    json={
                        "userId": command.user_id,
                        "ip": command.ip_address,
                        "userAgent": command.user_agent,
                        "score": command.score,
                        "reason": command.reason,
                        "loginHour": command.login_hour,
                        "occurredAt": command.occurred_at.isoformat(),
                    },
                )
        except Exception:  # noqa: BLE001 — la notificación jamás debe afectar el login
            logger.warning(
                "Fallo al notificar login sospechoso:\n%s", traceback.format_exc()
            )
```

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_http_admin_notifier.py -v`

Expected: PASS — 2 tests verdes.

- [ ] **Step 9: Commit**

```bash
git add apps/biometric-api/pyproject.toml apps/biometric-api/uv.lock \
  apps/biometric-api/config.py \
  apps/biometric-api/src/features/anomaly/domain/ports.py \
  apps/biometric-api/src/features/anomaly/application/dtos.py \
  apps/biometric-api/src/features/anomaly/infrastructure/notifiers.py \
  apps/biometric-api/tests/features/anomaly/test_http_admin_notifier.py
git commit -m "feat(anomaly): HttpAdminNotifier para alertar logins sospechosos vía push"
```

---

### Task 7: Conectar el notifier a `EvaluateLoginAnomalyUseCase`

**Files:**
- Modify: `apps/biometric-api/src/features/anomaly/application/use_cases.py`
- Modify: `apps/biometric-api/src/features/anomaly/infrastructure/tasks.py`
- Modify: `apps/biometric-api/tests/features/anomaly/test_evaluate_login_anomaly_use_case.py`

**Interfaces:**
- Consumes: `IAdminNotifier`, `NotifySuspiciousLoginCommand`, `HttpAdminNotifier`
  (Task 6).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de
`apps/biometric-api/tests/features/anomaly/test_evaluate_login_anomaly_use_case.py`:

```python
from src.features.anomaly.domain.ports import IAdminNotifier


class FakeNotifier(IAdminNotifier):
    def __init__(self):
        self.commands = []

    async def execute(self, command):
        self.commands.append(command)
        return None


async def test_suspicious_login_notifies_admin():
    reader = FakeHistoryReader(_MORNING_HOURS)
    logger = FakeAuditLogger()
    notifier = FakeNotifier()
    use_case = EvaluateLoginAnomalyUseCase(
        pattern_service=LoginTimePatternService(),
        history_reader=reader,
        audit_logger=logger,
        notifier=notifier,
    )

    await use_case.execute(
        EvaluateLoginAnomalyCommand(user_id="u1", attempt_time=_dt(3.0))
    )

    assert len(notifier.commands) == 1
    cmd = notifier.commands[0]
    assert cmd.user_id == "u1"
    assert cmd.reason == "unusual_hour"


async def test_normal_login_does_not_notify():
    reader = FakeHistoryReader(_MORNING_HOURS)
    logger = FakeAuditLogger()
    notifier = FakeNotifier()
    use_case = EvaluateLoginAnomalyUseCase(
        pattern_service=LoginTimePatternService(),
        history_reader=reader,
        audit_logger=logger,
        notifier=notifier,
    )

    await use_case.execute(
        EvaluateLoginAnomalyCommand(user_id="u1", attempt_time=_dt(9.1))
    )

    assert notifier.commands == []
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_evaluate_login_anomaly_use_case.py -v`

Expected: FAIL — `TypeError: EvaluateLoginAnomalyUseCase.__init__() got an unexpected keyword argument 'notifier'`.

- [ ] **Step 3: Wiring en el use case**

`apps/biometric-api/src/features/anomaly/application/use_cases.py` completo:

```python
from datetime import timedelta

from hexcore.application.use_cases.base import UseCase

from src.features.audit.application.dtos import LogBiometricEventCommand

from ..domain.ports import IAdminNotifier, IAuditEventLogger, ILoginHistoryReader
from ..domain.services import LoginTimePatternService
from ..domain.value_objects import AnomalyResult
from .dtos import EvaluateLoginAnomalyCommand, NotifySuspiciousLoginCommand


def _to_decimal_hour(dt) -> float:
    return dt.hour + dt.minute / 60.0 + dt.second / 3600.0


class EvaluateLoginAnomalyUseCase(UseCase[EvaluateLoginAnomalyCommand, AnomalyResult]):
    """Evalúa la hora de un login y registra auditoría si es sospechoso."""

    def __init__(
        self,
        pattern_service: LoginTimePatternService,
        history_reader: ILoginHistoryReader,
        audit_logger: IAuditEventLogger,
        notifier: IAdminNotifier | None = None,
        history_days: int = 90,
    ) -> None:
        super().__init__()
        self._pattern_service = pattern_service
        self._history_reader = history_reader
        self._audit_logger = audit_logger
        self._notifier = notifier
        self._history_days = history_days

    async def execute(self, command: EvaluateLoginAnomalyCommand) -> AnomalyResult:
        since = command.attempt_time - timedelta(days=self._history_days)
        history = await self._history_reader.get_login_times(
            command.user_id, since, command.attempt_time
        )
        history_hours = [_to_decimal_hour(dt) for dt in history]
        attempt_hour = _to_decimal_hour(command.attempt_time)

        result = self._pattern_service.evaluate(history_hours, attempt_hour)

        if result.is_suspicious:
            await self._audit_logger.execute(
                LogBiometricEventCommand(
                    action="biometric_suspicious_login",
                    user_id=command.user_id,
                    ip_address=command.ip_address,
                    user_agent=command.user_agent,
                    details={
                        "score": result.score,
                        "reason": result.reason,
                        "mean_hour": result.mean_hour,
                        "sigma_hours": result.sigma_hours,
                        "resultant_r": result.resultant_r,
                        "sample_size": result.sample_size,
                        "login_hour": attempt_hour,
                    },
                )
            )
            if self._notifier is not None:
                await self._notifier.execute(
                    NotifySuspiciousLoginCommand(
                        user_id=command.user_id,
                        ip_address=command.ip_address,
                        user_agent=command.user_agent,
                        score=result.score,
                        reason=result.reason,
                        login_hour=attempt_hour,
                        occurred_at=command.attempt_time,
                    )
                )

        return result
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_evaluate_login_anomaly_use_case.py -v`

Expected: PASS — todos los tests (los 4 preexistentes + los 2 nuevos) en verde.

- [ ] **Step 5: Inyectar `HttpAdminNotifier` en `run_login_anomaly_detection`**

`apps/biometric-api/src/features/anomaly/infrastructure/tasks.py` completo:

```python
import logging
import traceback
from datetime import datetime

from hexcore.infrastructure.repositories.orms.sqlalchemy.session import (
    AsyncSessionLocal,
)
from hexcore.infrastructure.uow import SqlAlchemyUnitOfWork

from config import config

from src.features.audit.application.use_cases import LogBiometricEventUseCase
from src.features.audit.infrastructure.repositories import BiometricAuditLogRepository
from src.features.biometrics.application.use_cases import IdentificationResponse

from ..application.dtos import EvaluateLoginAnomalyCommand
from ..application.use_cases import EvaluateLoginAnomalyUseCase
from ..domain.services import LoginTimePatternService
from ..domain.value_objects import AnomalyConfig
from .notifiers import HttpAdminNotifier
from .repositories import AuditLoginHistoryReader

logger = logging.getLogger("anomaly")


def should_run_login_detection(purpose: str, result: IdentificationResponse) -> bool:
    """True solo para logins reales con coincidencia."""
    return purpose == "login" and result.match and bool(result.user_id)


async def run_login_anomaly_detection(
    user_id: str,
    attempt_time: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    """Evalúa la anomalía en segundo plano. Nunca propaga errores."""
    try:
        async with AsyncSessionLocal() as session:
            uow = SqlAlchemyUnitOfWork(session=session)
            history_reader = AuditLoginHistoryReader(session)
            audit_repo = BiometricAuditLogRepository(uow)
            audit_logger = LogBiometricEventUseCase(repo=audit_repo, uow=uow)
            pattern_service = LoginTimePatternService(
                AnomalyConfig(
                    min_samples=config.anomaly_min_samples,
                    k=config.anomaly_k,
                    min_r=config.anomaly_min_r,
                )
            )
            use_case = EvaluateLoginAnomalyUseCase(
                pattern_service=pattern_service,
                history_reader=history_reader,
                audit_logger=audit_logger,
                notifier=HttpAdminNotifier(),
                history_days=config.anomaly_history_days,
            )
            await use_case.execute(
                EvaluateLoginAnomalyCommand(
                    user_id=user_id,
                    attempt_time=attempt_time,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            )
    except Exception:  # noqa: BLE001 — la detección jamás debe afectar el login
        logger.warning("Fallo en detección de login anómalo:\n%s", traceback.format_exc())
```

- [ ] **Step 6: Ejecutar toda la suite de anomaly**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/ -v`

Expected: PASS — todos los tests en verde (ningún regresión en los tests preexistentes
de `LoginTimePatternService`, `AuditLoginHistoryReader` ni `should_run_login_detection`).

- [ ] **Step 7: Commit**

```bash
git add apps/biometric-api/src/features/anomaly/application/use_cases.py \
  apps/biometric-api/src/features/anomaly/infrastructure/tasks.py \
  apps/biometric-api/tests/features/anomaly/test_evaluate_login_anomaly_use_case.py
git commit -m "feat(anomaly): notificar a admin/gerente/jefe cuando un login es sospechoso"
```

---

### Task 8: Service Worker de Web Push

**Files:**
- Create: `apps/web/public/push-sw.js`

**Interfaces:**
- Produces: manejadores `push` y `notificationclick` — registrado por el hook del
  Task 9 vía `navigator.serviceWorker.register('/push-sw.js')`.

- [ ] **Step 1: Crear el archivo**

`apps/web/public/push-sw.js`:

```js
self.addEventListener("push", (event) => {
	const data = event.data ? event.data.json() : {};
	event.waitUntil(
		self.registration.showNotification(data.title || "Alerta de seguridad", {
			body: data.body,
			icon: "/logo192.png",
			data: data.data,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(clients.openWindow("/admin"));
});
```

- [ ] **Step 2: Verificar que se sirve como archivo estático**

Con `pnpm dev:web` corriendo:

Run: `curl -s http://localhost:3001/push-sw.js`

Expected: imprime el contenido del archivo (confirma que Vite lo sirve desde `public/`
en la raíz, igual que `manifest.json`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/push-sw.js
git commit -m "feat(web): service worker para Web Push"
```

---

### Task 9: Hook `usePushNotifications`

**Files:**
- Create: `apps/web/src/hooks/use-push-notifications.ts`

**Interfaces:**
- Consumes: `push-sw.js` (Task 8), endpoints `/api/trpc/notifications.*` (Task 5).
- Produces: `usePushNotifications(): { isSupported, isSubscribed, subscribe, unsubscribe }`
  — usado por Task 10.

- [ ] **Step 1: Crear el hook**

`apps/web/src/hooks/use-push-notifications.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window)
  }, [])

  useEffect(() => {
    if (!isSupported) return
    navigator.serviceWorker.getRegistration('/push-sw.js').then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription()
      setIsSubscribed(!!subscription)
    })
  }, [isSupported])

  const subscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.register('/push-sw.js')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('Permiso de notificaciones denegado.')
    }

    const keyRes = await fetch('/api/trpc/notifications.getVapidPublicKey')
    if (!keyRes.ok) throw new Error('No se pudo obtener la clave VAPID.')
    const keyData = await keyRes.json()
    const publicKey = keyData.result.data.publicKey as string

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    const res = await fetch('/api/trpc/notifications.subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    if (!res.ok) throw new Error('No se pudo guardar la suscripción.')

    setIsSubscribed(true)
  }, [])

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/push-sw.js')
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) {
      setIsSubscribed(false)
      return
    }

    await fetch('/api/trpc/notifications.unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    await subscription.unsubscribe()
    setIsSubscribed(false)
  }, [])

  return { isSupported, isSubscribed, subscribe, unsubscribe }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter web check-types`

Expected: sin errores de TypeScript nuevos atribuibles a este archivo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-push-notifications.ts
git commit -m "feat(web): hook usePushNotifications"
```

---

### Task 10: Toggle de alertas en la consola admin

**Files:**
- Modify: `apps/web/src/routes/admin.tsx`

**Interfaces:**
- Consumes: `usePushNotifications` (Task 9).

- [ ] **Step 1: Importar el hook y el ícono**

En `apps/web/src/routes/admin.tsx`, ampliar el import de `lucide-react`:

```tsx
import {
  Users,
  Activity,
  UserPlus,
  Camera,
  Trash2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RefreshCw,
  LogOut,
  Bell,
  BellOff,
} from 'lucide-react'
```

y añadir junto al resto de imports:

```tsx
import { usePushNotifications } from '#/hooks/use-push-notifications'
```

- [ ] **Step 2: Añadir el estado y el handler dentro de `AdminConsole`**

Después de la línea `const { data: sessionData, isPending: sessionLoading, error: sessionError } = authClient.useSession()`:

```tsx
  const push = usePushNotifications()
  const ALERT_ROLES = ['admin', 'gerente', 'jefe']
  const canReceiveAlerts = ALERT_ROLES.includes((sessionData as any)?.user?.role ?? '')

  async function handleTogglePush() {
    try {
      if (push.isSubscribed) {
        await push.unsubscribe()
        toast.success('Alertas de seguridad desactivadas.')
      } else {
        await push.subscribe()
        toast.success('Alertas de seguridad activadas.')
      }
    } catch (err: any) {
      toast.danger(err.message || 'No se pudieron actualizar las alertas.')
    }
  }
```

- [ ] **Step 3: Añadir el botón en el encabezado**

En el grupo de botones del encabezado (junto a "Actualizar Datos" y "Cerrar Sesión"),
antes del botón "Actualizar Datos":

```tsx
            {canReceiveAlerts && push.isSupported && (
              <Button
                onPress={handleTogglePush}
                variant="secondary"
                className="flex items-center gap-2 text-sm font-semibold cursor-pointer"
              >
                {push.isSubscribed ? <BellOff size={16} /> : <Bell size={16} />}
                {push.isSubscribed ? 'Desactivar Alertas' : 'Activar Alertas'}
              </Button>
            )}
```

- [ ] **Step 4: Verificar tipos y manualmente en el navegador**

Run: `pnpm --filter web check-types`

Manual: con `pnpm dev` corriendo (server + web), loguear como usuario `admin`, ir a
`/admin`, confirmar que aparece el botón "Activar Alertas", hacer clic, aceptar el
permiso de notificaciones del navegador, y confirmar que cambia a "Desactivar Alertas".
Loguear como usuario con rol `user` y confirmar que el botón NO aparece.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/admin.tsx
git commit -m "feat(web): toggle de alertas de seguridad en la consola admin"
```

---

### Task 11: Verificación manual end-to-end

Sin código nuevo — confirma que las piezas de los Tasks 1-10 funcionan juntas.

- [ ] **Step 1: Levantar el stack completo**

Run: `pnpm dev` (server + web) y, en paralelo, `cd apps/biometric-api && uv run uvicorn main:app --reload` (o el comando de dev habitual del servicio Python).

- [ ] **Step 2: Suscribirse a las alertas**

Loguear en `http://localhost:3001` como un usuario con rol `admin`, ir a `/admin`,
activar "Activar Alertas" y aceptar el permiso de notificaciones del navegador.

- [ ] **Step 3: Verificar la fila en `push_subscription`**

Run: `pnpm db:studio` y confirmar que existe una fila en `push_subscription` con el
`userId` del admin logueado.

- [ ] **Step 4: Forzar un login sospechoso**

Insertar manualmente >= `ANOMALY_MIN_SAMPLES` (20) filas de `biometric_audit_log` con
`action = 'biometric_access_granted'` para un usuario de prueba, todas a una hora
consistente (p.ej. 09:00), vía `pnpm db:studio` o un script SQL directo. Luego disparar
`POST /v1/biometrics/identify` con `purpose=login` para ese usuario a una hora muy
distinta (p.ej. 03:00, ajustando `attempt_time` si se prueba invocando el use case
directo en una shell de Python).

- [ ] **Step 5: Confirmar la notificación**

Expected: llega una notificación del sistema operativo con el texto "Login biométrico
sospechoso" dentro de los segundos siguientes al login. Verificar también en
`biometric_audit_log` que se registró `biometric_suspicious_login` (comportamiento ya
existente, no debe romperse).

- [ ] **Step 6: Confirmar limpieza de suscripciones expiradas**

Revocar el permiso de notificaciones desde la configuración del navegador (o borrar la
suscripción con `subscription.unsubscribe()` desde devtools sin avisar al backend), y
repetir el Paso 4. Confirmar que la fila correspondiente en `push_subscription` se borra
sola (el endpoint interno la eliminó tras recibir `410 Gone` de `web-push`).
