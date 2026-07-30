import { createContext } from "@access-control-system/api/context";
import { appRouter } from "@access-control-system/api/routers/index";
import {
	type IncidentFilter,
	incidentStats,
	queryIncidents,
} from "@access-control-system/api/services/incidents";
import { auth } from "@access-control-system/auth";
import { createDb } from "@access-control-system/db";
import { oneTimeToken, user } from "@access-control-system/db/schema/auth";
import { userImage } from "@access-control-system/db/schema/media";
import { pushSubscription } from "@access-control-system/db/schema/notifications";
import {
	securityIncident,
	securityZone,
} from "@access-control-system/db/schema/security";
import { env } from "@access-control-system/env/server";
import { trpcServer } from "@hono/trpc-server";
import { and, eq, gt, inArray } from "drizzle-orm";
import { EventEmitter } from "events";
import { Hono, type Context as HonoContext } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import webpush from "web-push";
import { z } from "zod";
import { notifySuspiciousLogin } from "./notifications/suspicious-login-notifier";
import {
	buildIncidentPdf,
	buildIncidentWorkbook,
	formatDate,
	type ReportFilterSummary,
} from "./reports/incident-report";

const sseEvents = new EventEmitter();
sseEvents.setMaxListeners(100);

const setupAdminSchema = z.object({
	email: z.email(),
	password: z.string().min(8),
	name: z.string().min(2),
	secret: z.string(),
});

const app = new Hono();

/** Roles autorizados a consultar evidencia de terceros y reportes. */
const SECURITY_ROLES = ["admin", "gerente", "jefe"];

/** Huso usado para fechar los reportes cuando el cliente no indica otro. */
const DEFAULT_REPORT_TZ = "America/Caracas";

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

		const consumed = updated[0];
		if (!consumed) {
			return c.json(
				{ error: "Token has already been used, expired, or is invalid" },
				401,
			);
		}

		const [userRecord] = await db
			.select()
			.from(user)
			.where(eq(user.id, consumed.userId))
			.limit(1);

		if (!userRecord) {
			return c.json({ error: "Associated user not found" }, 404);
		}

		// Notificar cambio para actualizar logs
		sseEvents.emit("change");

		return c.json({
			session: {
				user: {
					id: userRecord.id,
					email: userRecord.email,
					name: userRecord.name,
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
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, body.userId))
		.limit(1);

	// La detección de anomalía horaria alimenta el módulo de incidentes: queda
	// auditable y exportable junto con los accesos fuera de turno a zonas.
	const occurredAt = new Date(body.occurredAt);
	const loginHour = Math.floor(body.loginHour);
	const loginMinute = Math.round((body.loginHour - loginHour) * 60);
	const hourLabel = `${String(loginHour).padStart(2, "0")}:${String(
		loginMinute,
	).padStart(2, "0")}`;
	const personLabel = suspiciousUser?.name ?? "Un usuario del sistema";

	try {
		await db.insert(securityIncident).values({
			occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
			type: "anomalous_login_hour",
			severity: body.score >= 4 ? "high" : "medium",
			status: "open",
			title: "Ingreso biométrico en horario inusual",
			description: `${personLabel} accedió mediante reconocimiento facial a las ${hourLabel}, una hora que se aparta de su patrón histórico de ingresos (puntuación de anomalía ${body.score.toFixed(
				2,
			)}, motivo «${body.reason}»). Se recomienda verificar si el acceso fue autorizado.`,
			userId: body.userId,
			userNameSnapshot: suspiciousUser?.name ?? null,
			userEmailSnapshot: suspiciousUser?.email ?? null,
			source: "biometric-api",
			ipAddress: body.ip ?? null,
			userAgent: body.userAgent ?? null,
			details: {
				score: body.score,
				reason: body.reason,
				loginHour: body.loginHour,
			},
		});
		sseEvents.emit("change");
	} catch (error) {
		// El registro del incidente nunca debe impedir el envío de la alerta.
		console.error("[security] No se pudo registrar el incidente:", error);
	}

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

/* ── Evidencia fotográfica ───────────────────────────────────────────────── */

/**
 * Sirve los bytes de una imagen de registro. Se sirve por HTTP en vez de por
 * tRPC para que el navegador la trate como un recurso cacheable y el JSON del
 * listado se mantenga liviano.
 */
app.get("/api/media/user-images/:id", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const db = createDb();
	const [image] = await db
		.select()
		.from(userImage)
		.where(eq(userImage.id, c.req.param("id")))
		.limit(1);

	if (!image) {
		return c.json({ error: "Imagen no encontrada" }, 404);
	}

	// Cada quien ve su propia evidencia; el resto exige rol de supervisión.
	const role = session.user.role ?? "user";
	const isOwner = image.userId === session.user.id;
	if (!isOwner && !SECURITY_ROLES.includes(role)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	return new Response(new Uint8Array(image.data), {
		headers: {
			"Content-Type": image.contentType,
			"Content-Length": String(image.data.byteLength),
			"Cache-Control": "private, max-age=3600",
		},
	});
});

/* ── Reportes de incidentes ──────────────────────────────────────────────── */

function parseDateParam(value: string | undefined, endOfDay = false) {
	if (!value) return undefined;
	// Una fecha suelta (`2026-07-31`) se interpreta como el día completo.
	const raw = /^\d{4}-\d{2}-\d{2}$/.test(value)
		? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`
		: value;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readReportFilters(c: HonoContext) {
	const q = c.req.query();
	return {
		from: parseDateParam(q.from),
		to: parseDateParam(q.to, true),
		zoneId: q.zoneId || undefined,
		userId: q.userId || undefined,
		type: (q.type || undefined) as IncidentFilter["type"],
		severity: (q.severity || undefined) as IncidentFilter["severity"],
		status: (q.status || undefined) as IncidentFilter["status"],
		search: q.search?.trim() || undefined,
		limit: 5000,
		offset: 0,
	} satisfies Partial<IncidentFilter>;
}

async function buildFilterSummary(
	filters: Partial<IncidentFilter>,
	timeZone: string,
): Promise<ReportFilterSummary> {
	const db = createDb();

	const range =
		filters.from || filters.to
			? `${filters.from ? formatDate(filters.from, timeZone) : "Inicio"} — ${
					filters.to ? formatDate(filters.to, timeZone) : "Hoy"
				}`
			: "Histórico completo";

	let zoneLabel = "Todas las zonas";
	if (filters.zoneId) {
		const [zone] = await db
			.select({ name: securityZone.name, code: securityZone.code })
			.from(securityZone)
			.where(eq(securityZone.id, filters.zoneId))
			.limit(1);
		zoneLabel = zone ? `${zone.name} (${zone.code})` : filters.zoneId;
	}

	let userLabel = "Todo el personal";
	if (filters.userId) {
		const [subject] = await db
			.select({ name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, filters.userId))
			.limit(1);
		userLabel = subject ? `${subject.name} (${subject.email})` : filters.userId;
	}

	return [
		{ label: "Rango de fechas", value: range },
		{ label: "Zona / Área", value: zoneLabel },
		{ label: "Usuario", value: userLabel },
		{ label: "Tipo de incidente", value: filters.type ?? "Todos" },
		{ label: "Severidad", value: filters.severity ?? "Todas" },
		{ label: "Estado", value: filters.status ?? "Todos" },
		{ label: "Búsqueda", value: filters.search ?? "—" },
	];
}

async function requireReportAccess(c: HonoContext) {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session)
		return { error: c.json({ error: "Unauthorized" }, 401) } as const;
	const role = session.user.role ?? "user";
	if (!SECURITY_ROLES.includes(role)) {
		return { error: c.json({ error: "Forbidden" }, 403) } as const;
	}
	return { session } as const;
}

function reportFileName(extension: string) {
	const stamp = new Date().toISOString().slice(0, 10);
	return `incidentes-seguridad-${stamp}.${extension}`;
}

app.get("/api/reports/incidents.xlsx", async (c) => {
	const access = await requireReportAccess(c);
	if ("error" in access) return access.error;

	const timeZone = c.req.query("tz") || DEFAULT_REPORT_TZ;
	const filters = readReportFilters(c);
	const [rows, stats, summary] = await Promise.all([
		queryIncidents(filters),
		incidentStats(filters),
		buildFilterSummary(filters, timeZone),
	]);

	const workbook = await buildIncidentWorkbook(rows, {
		generatedAt: new Date(),
		generatedBy: `${access.session.user.name} <${access.session.user.email}>`,
		timeZone,
		filters: summary,
		stats,
	});

	return new Response(new Uint8Array(workbook), {
		headers: {
			"Content-Type":
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"Content-Disposition": `attachment; filename="${reportFileName("xlsx")}"`,
			"Cache-Control": "no-store",
		},
	});
});

app.get("/api/reports/incidents.pdf", async (c) => {
	const access = await requireReportAccess(c);
	if ("error" in access) return access.error;

	const timeZone = c.req.query("tz") || DEFAULT_REPORT_TZ;
	const filters = readReportFilters(c);
	const [rows, stats, summary] = await Promise.all([
		queryIncidents(filters),
		incidentStats(filters),
		buildFilterSummary(filters, timeZone),
	]);

	const pdf = buildIncidentPdf(rows, {
		generatedAt: new Date(),
		generatedBy: `${access.session.user.name} <${access.session.user.email}>`,
		timeZone,
		filters: summary,
		stats,
	});

	return new Response(new Uint8Array(pdf), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${reportFileName("pdf")}"`,
			"Cache-Control": "no-store",
		},
	});
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
