import { createContext } from "@access-control-system/api/context";
import { appRouter } from "@access-control-system/api/routers/index";
import { auth } from "@access-control-system/auth";
import { createDb } from "@access-control-system/db";
import { oneTimeToken, user } from "@access-control-system/db/schema/auth";
import { pushSubscription } from "@access-control-system/db/schema/notifications";
import { env } from "@access-control-system/env/server";
import { trpcServer } from "@hono/trpc-server";
import { and, eq, gt, inArray } from "drizzle-orm";
import { EventEmitter } from "events";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import webpush from "web-push";
import { z } from "zod";
import { notifySuspiciousLogin } from "./notifications/suspicious-login-notifier";

const sseEvents = new EventEmitter();
sseEvents.setMaxListeners(100);

const setupAdminSchema = z.object({
	email: z.email(),
	password: z.string().min(8),
	name: z.string().min(2),
	secret: z.string(),
});

const app = new Hono();

webpush.setVapidDetails(
	env.VAPID_SUBJECT,
	env.VAPID_PUBLIC_KEY,
	env.VAPID_PRIVATE_KEY,
);

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

// Endpoint de Eventos de Servidor (SSE) en Tiempo Real
app.get("/api/sse/live-updates", async (c) => {
	return streamSSE(c, async (stream) => {
		// Evento inicial de sincronización
		await stream.writeSSE({
			data: "sync",
			event: "message",
			id: String(Date.now()),
		});

		const listener = async () => {
			try {
				await stream.writeSSE({
					data: "update",
					event: "message",
					id: String(Date.now()),
				});
			} catch (err) {
				// Stream cerrado
			}
		};

		sseEvents.on("change", listener);

		// Heartbeat de 2 segundos para sincronización garantizada sin lags
		const interval = setInterval(async () => {
			try {
				await stream.writeSSE({
					data: "update",
					event: "message",
					id: String(Date.now()),
				});
			} catch {
				cleanup();
			}
		}, 2000);

		const cleanup = () => {
			clearInterval(interval);
			sseEvents.off("change", listener);
		};

		c.req.raw.signal.addEventListener("abort", cleanup);
	});
});

app.post("/api/auth/one-time-token/verify", async (c) => {
	try {
		const body = await c.req.json().catch(() => null);
		if (!body || typeof body.token !== "string") {
			return c.json({ error: "Invalid payload" }, 400);
		}

		const db = createDb();
		const updated = await db
			.update(oneTimeToken)
			.set({ used: true })
			.where(
				and(
					eq(oneTimeToken.token, body.token),
					eq(oneTimeToken.used, false),
					gt(oneTimeToken.expiresAt, new Date()),
				),
			)
			.returning();

		if (updated.length === 0) {
			return c.json(
				{ error: "Token has already been used, expired, or is invalid" },
				401,
			);
		}

		const userId = updated[0].userId;
		const userRecord = await db
			.select()
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (userRecord.length === 0) {
			return c.json({ error: "Associated user not found" }, 404);
		}

		// Notificar cambio para actualizar logs
		sseEvents.emit("change");

		return c.json({
			session: {
				user: {
					id: userRecord[0].id,
					email: userRecord[0].email,
					name: userRecord[0].name,
				},
			},
		});
	} catch (error) {
		console.error("OTT verification error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/setup-status", async (c) => {
	const db = createDb();
	const existing = await db.select({ id: user.id }).from(user).limit(1);
	return c.json({ needsSetup: existing.length === 0 });
});

app.post("/api/setup-admin", async (c) => {
	const parsed = setupAdminSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) {
		return c.json({ error: "Invalid payload" }, 400);
	}
	if (parsed.data.secret !== env.ADMIN_SETUP_SECRET) {
		return c.json({ error: "Invalid setup secret" }, 401);
	}

	const db = createDb();
	const existing = await db.select({ id: user.id }).from(user).limit(1);
	if (existing.length > 0) {
		return c.json({ error: "Admin already exists" }, 409);
	}

	const authContext = await auth.$context;
	const hashedPassword = await authContext.password.hash(parsed.data.password);
	const newUser = await authContext.internalAdapter.createUser({
		email: parsed.data.email,
		name: parsed.data.name,
		emailVerified: true,
		role: "admin",
	});
	await authContext.internalAdapter.createAccount({
		userId: newUser.id,
		providerId: "credential",
		accountId: newUser.id,
		password: hashedPassword,
	});

	// Notificar cambio
	sseEvents.emit("change");

	return c.json({ success: true });
});

const suspiciousLoginSchema = z.object({
	userId: z.string(),
	ip: z.string().nullable().optional(),
	userAgent: z.string().nullable().optional(),
	score: z.number(),
	reason: z.string(),
	loginHour: z.number(),
	occurredAt: z.string(),
});

// Endpoint interno: NUNCA debe exponerse públicamente en el reverse proxy de
// producción (igual que /api/setup-admin). Solo accesible en la red interna
// de Docker; protegido por x-internal-api-key.
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

app.use(
	"/api/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError: ({ path, error }) => {
			// El mensaje que llega al cliente no incluye la causa real (p.ej. el
			// error concreto de Postgres) — se loguea acá para poder diagnosticar.
			console.error(`[trpc] Error en "${path}":`, error);
			if (error.cause) {
				console.error("[trpc] Causa original:", error.cause);
			}
		},
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

import { serve } from "@hono/node-server";

serve(
	{
		fetch: app.fetch,
		port: 3000,
		hostname: "0.0.0.0",
	},
	(info) => {
		console.log(`Server is running on http://0.0.0.0:${info.port}`);
	},
);
