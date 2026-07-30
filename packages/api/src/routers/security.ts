import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";
import {
	INCIDENT_SEVERITIES,
	INCIDENT_STATUSES,
	INCIDENT_TYPES,
	securityIncident,
	securityZone,
	ZONE_RISK_LEVELS,
} from "@access-control-system/db/schema/security";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
	adminProcedure,
	protectedProcedure,
	router,
	securityProcedure,
} from "../index";
import {
	incidentFilterSchema,
	incidentStats,
	queryIncidents,
} from "../services/incidents";
import {
	describeVerdict,
	incidentTypeForReason,
	isWithinSchedule,
} from "../services/zone-schedule";

const db = createDb();

const minuteOfDay = z.number().int().min(0).max(1439);

const zoneInputSchema = z.object({
	code: z
		.string()
		.trim()
		.min(2)
		.max(32)
		.regex(
			/^[A-Za-z0-9_-]+$/,
			"El código solo admite letras, números, guiones y guiones bajos.",
		),
	name: z.string().trim().min(2).max(120),
	description: z.string().trim().max(500).optional().nullable(),
	riskLevel: z.enum(ZONE_RISK_LEVELS).default("medium"),
	restricted: z.boolean().default(true),
	allowedFromMinute: minuteOfDay.default(480),
	allowedToMinute: minuteOfDay.default(1080),
	allowedDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
	timezone: z.string().trim().min(1).max(64).default("America/Caracas"),
	active: z.boolean().default(true),
});

/** Severidad sugerida según el riesgo de la zona donde ocurrió el hecho. */
function severityForZone(riskLevel: string) {
	switch (riskLevel) {
		case "critical":
			return "critical" as const;
		case "high":
			return "high" as const;
		case "low":
			return "low" as const;
		default:
			return "medium" as const;
	}
}

export const securityRouter = router({
	/* ── Zonas / puntos de acceso ─────────────────────────────────────────── */
	zones: router({
		list: protectedProcedure.query(async () => {
			return db.select().from(securityZone).orderBy(asc(securityZone.name));
		}),

		create: adminProcedure
			.input(zoneInputSchema)
			.mutation(async ({ input }) => {
				const [existing] = await db
					.select({ id: securityZone.id })
					.from(securityZone)
					.where(eq(securityZone.code, input.code))
					.limit(1);
				if (existing) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Ya existe una zona con el código «${input.code}».`,
					});
				}

				const [created] = await db
					.insert(securityZone)
					.values({
						...input,
						description: input.description ?? null,
					})
					.returning();
				return created;
			}),

		update: adminProcedure
			.input(zoneInputSchema.partial().extend({ id: z.string().min(1) }))
			.mutation(async ({ input }) => {
				const { id, ...changes } = input;
				const [updated] = await db
					.update(securityZone)
					.set(changes)
					.where(eq(securityZone.id, id))
					.returning();
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "La zona indicada no existe.",
					});
				}
				return updated;
			}),

		remove: adminProcedure
			.input(z.object({ id: z.string().min(1) }))
			.mutation(async ({ input }) => {
				await db.delete(securityZone).where(eq(securityZone.id, input.id));
				return { success: true };
			}),
	}),

	/* ── Incidentes ───────────────────────────────────────────────────────── */
	incidents: router({
		list: securityProcedure
			.input(incidentFilterSchema.partial().optional())
			.query(async ({ input }) => {
				return queryIncidents(input ?? {});
			}),

		stats: securityProcedure
			.input(incidentFilterSchema.partial().optional())
			.query(async ({ input }) => {
				return incidentStats(input ?? {});
			}),

		/** Reporte manual levantado por un supervisor desde el panel. */
		create: securityProcedure
			.input(
				z.object({
					title: z.string().trim().min(3).max(160),
					description: z.string().trim().min(10).max(4000),
					occurredAt: z.coerce.date(),
					type: z.enum(INCIDENT_TYPES).default("manual_report"),
					severity: z.enum(INCIDENT_SEVERITIES).default("medium"),
					userId: z.string().min(1).optional().nullable(),
					zoneId: z.string().min(1).optional().nullable(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const [subject] = input.userId
					? await db
							.select({ name: user.name, email: user.email })
							.from(user)
							.where(eq(user.id, input.userId))
							.limit(1)
					: [];
				const [zone] = input.zoneId
					? await db
							.select({ name: securityZone.name })
							.from(securityZone)
							.where(eq(securityZone.id, input.zoneId))
							.limit(1)
					: [];

				const [created] = await db
					.insert(securityIncident)
					.values({
						occurredAt: input.occurredAt,
						type: input.type,
						severity: input.severity,
						status: "open",
						title: input.title,
						description: input.description,
						userId: input.userId ?? null,
						userNameSnapshot: subject?.name ?? null,
						userEmailSnapshot: subject?.email ?? null,
						zoneId: input.zoneId ?? null,
						zoneNameSnapshot: zone?.name ?? null,
						source: "manual",
						details: {
							reportedBy: ctx.session.user.id,
							reportedByName: ctx.session.user.name,
						},
					})
					.returning();
				return created;
			}),

		updateStatus: securityProcedure
			.input(
				z.object({
					id: z.string().min(1),
					status: z.enum(INCIDENT_STATUSES),
					resolutionNotes: z.string().trim().max(2000).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const acknowledging =
					input.status === "acknowledged" ||
					input.status === "resolved" ||
					input.status === "dismissed";

				const [updated] = await db
					.update(securityIncident)
					.set({
						status: input.status,
						resolutionNotes: input.resolutionNotes ?? null,
						acknowledgedBy: acknowledging ? ctx.session.user.id : null,
						acknowledgedAt: acknowledging ? new Date() : null,
					})
					.where(eq(securityIncident.id, input.id))
					.returning();

				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "El incidente indicado no existe.",
					});
				}
				return updated;
			}),
	}),

	/**
	 * Valida un acceso contra el horario de la zona y, si corresponde, levanta
	 * el incidente. Es el punto que llama el kiosco tras identificar el rostro.
	 */
	evaluateAccess: protectedProcedure
		.input(
			z
				.object({
					/** El kiosco identifica su zona por código; el panel, por id. */
					zoneId: z.string().min(1).optional(),
					zoneCode: z.string().min(1).optional(),
					/** Solo administración puede evaluar en nombre de otra persona. */
					userId: z.string().min(1).optional(),
					at: z.coerce.date().optional(),
					source: z.string().trim().max(40).default("kiosk"),
				})
				.refine((value) => Boolean(value.zoneId || value.zoneCode), {
					message: "Indica la zona mediante `zoneId` o `zoneCode`.",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const isAdmin = (ctx.session.user.role ?? "user") === "admin";
			const subjectId =
				input.userId && isAdmin ? input.userId : ctx.session.user.id;
			const at = input.at ?? new Date();

			const [zone] = await db
				.select()
				.from(securityZone)
				.where(
					input.zoneId
						? eq(securityZone.id, input.zoneId)
						: eq(securityZone.code, input.zoneCode as string),
				)
				.limit(1);

			if (!zone) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "La zona indicada no existe.",
				});
			}

			const verdict = isWithinSchedule(zone, at);
			if (verdict.allowed) {
				return { allowed: true as const, verdict, incident: null };
			}

			const [subject] = await db
				.select({ name: user.name, email: user.email })
				.from(user)
				.where(eq(user.id, subjectId))
				.limit(1);

			const personLabel = subject?.name ?? "Un usuario no identificado";
			const [incident] = await db
				.insert(securityIncident)
				.values({
					occurredAt: at,
					type: incidentTypeForReason(verdict.reason),
					severity: severityForZone(zone.riskLevel),
					status: "open",
					title: `Acceso no autorizado en «${zone.name}»`,
					description: describeVerdict(verdict, zone.name, personLabel),
					userId: subjectId,
					userNameSnapshot: subject?.name ?? null,
					userEmailSnapshot: subject?.email ?? null,
					zoneId: zone.id,
					zoneNameSnapshot: zone.name,
					source: input.source,
					details: {
						reason: verdict.reason,
						localTime: verdict.localTime,
						localWeekday: verdict.localWeekday,
						allowedWindow: verdict.windowLabel,
						allowedDays: zone.allowedDays,
						timezone: zone.timezone,
						zoneCode: zone.code,
					},
				})
				.returning();

			return { allowed: false as const, verdict, incident };
		}),
});
