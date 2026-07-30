import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";
import {
	INCIDENT_SEVERITIES,
	INCIDENT_STATUSES,
	INCIDENT_TYPES,
	securityIncident,
	securityZone,
} from "@access-control-system/db/schema/security";
import { and, desc, eq, gte, ilike, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

const db = createDb();

/**
 * Filtros del reporte de incidentes. Compartidos por el listado en pantalla y
 * por los exportadores PDF/XLSX, de modo que lo que se ve es exactamente lo que
 * se exporta.
 */
export const incidentFilterSchema = z.object({
	/** Inicio del rango (inclusive). */
	from: z.coerce.date().optional(),
	/** Fin del rango (inclusive). */
	to: z.coerce.date().optional(),
	zoneId: z.string().min(1).optional(),
	userId: z.string().min(1).optional(),
	type: z.enum(INCIDENT_TYPES).optional(),
	severity: z.enum(INCIDENT_SEVERITIES).optional(),
	status: z.enum(INCIDENT_STATUSES).optional(),
	search: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(5000).default(200),
	offset: z.coerce.number().int().min(0).default(0),
});

export type IncidentFilter = z.infer<typeof incidentFilterSchema>;

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
	off_hours_access: "Acceso fuera de horario",
	restricted_day_access: "Acceso en día no habilitado",
	inactive_zone_access: "Acceso a zona fuera de servicio",
	anomalous_login_hour: "Hora de ingreso anómala",
	unrecognized_face: "Rostro no reconocido",
	manual_report: "Reporte manual",
};

export const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
	low: "Baja",
	medium: "Media",
	high: "Alta",
	critical: "Crítica",
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
	open: "Abierto",
	acknowledged: "En revisión",
	resolved: "Resuelto",
	dismissed: "Descartado",
};

function buildConditions(filter: Partial<IncidentFilter>): SQL[] {
	const conditions: SQL[] = [];

	if (filter.from) {
		conditions.push(gte(securityIncident.occurredAt, filter.from));
	}
	if (filter.to) {
		conditions.push(lte(securityIncident.occurredAt, filter.to));
	}
	if (filter.zoneId) {
		conditions.push(eq(securityIncident.zoneId, filter.zoneId));
	}
	if (filter.userId) {
		conditions.push(eq(securityIncident.userId, filter.userId));
	}
	if (filter.type) {
		conditions.push(eq(securityIncident.type, filter.type));
	}
	if (filter.severity) {
		conditions.push(eq(securityIncident.severity, filter.severity));
	}
	if (filter.status) {
		conditions.push(eq(securityIncident.status, filter.status));
	}
	if (filter.search) {
		const pattern = `%${filter.search}%`;
		const match = or(
			ilike(securityIncident.title, pattern),
			ilike(securityIncident.description, pattern),
			ilike(securityIncident.userNameSnapshot, pattern),
			ilike(securityIncident.zoneNameSnapshot, pattern),
		);
		if (match) conditions.push(match);
	}

	return conditions;
}

/**
 * Nombre vigente del usuario/zona, con respaldo en la instantánea guardada al
 * momento del hecho: un incidente sigue siendo legible aunque el empleado haya
 * sido eliminado del sistema.
 */
const resolvedUserName = sql<
	string | null
>`coalesce(${user.name}, ${securityIncident.userNameSnapshot})`;
const resolvedUserEmail = sql<
	string | null
>`coalesce(${user.email}, ${securityIncident.userEmailSnapshot})`;
const resolvedZoneName = sql<
	string | null
>`coalesce(${securityZone.name}, ${securityIncident.zoneNameSnapshot})`;

export async function queryIncidents(filter: Partial<IncidentFilter>) {
	const conditions = buildConditions(filter);

	return db
		.select({
			id: securityIncident.id,
			occurredAt: securityIncident.occurredAt,
			detectedAt: securityIncident.detectedAt,
			type: securityIncident.type,
			severity: securityIncident.severity,
			status: securityIncident.status,
			title: securityIncident.title,
			description: securityIncident.description,
			userId: securityIncident.userId,
			userName: resolvedUserName,
			userEmail: resolvedUserEmail,
			zoneId: securityIncident.zoneId,
			zoneName: resolvedZoneName,
			zoneCode: securityZone.code,
			source: securityIncident.source,
			ipAddress: securityIncident.ipAddress,
			userAgent: securityIncident.userAgent,
			details: securityIncident.details,
			acknowledgedAt: securityIncident.acknowledgedAt,
			resolutionNotes: securityIncident.resolutionNotes,
			createdAt: securityIncident.createdAt,
		})
		.from(securityIncident)
		.leftJoin(user, eq(securityIncident.userId, user.id))
		.leftJoin(securityZone, eq(securityIncident.zoneId, securityZone.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(securityIncident.occurredAt))
		.limit(filter.limit ?? 200)
		.offset(filter.offset ?? 0);
}

export type IncidentRow = Awaited<ReturnType<typeof queryIncidents>>[number];

/** Totales del conjunto filtrado — alimenta las tarjetas y el resumen del PDF. */
export async function incidentStats(filter: Partial<IncidentFilter>) {
	const conditions = buildConditions(filter);
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [totals] = await db
		.select({
			total: sql<number>`count(*)::int`,
			open: sql<number>`count(*) filter (where ${securityIncident.status} = 'open')::int`,
			critical: sql<number>`count(*) filter (where ${securityIncident.severity} = 'critical')::int`,
			high: sql<number>`count(*) filter (where ${securityIncident.severity} = 'high')::int`,
			resolved: sql<number>`count(*) filter (where ${securityIncident.status} = 'resolved')::int`,
		})
		.from(securityIncident)
		.where(where);

	const byType = await db
		.select({
			type: securityIncident.type,
			count: sql<number>`count(*)::int`,
		})
		.from(securityIncident)
		.where(where)
		.groupBy(securityIncident.type);

	return {
		total: totals?.total ?? 0,
		open: totals?.open ?? 0,
		critical: totals?.critical ?? 0,
		high: totals?.high ?? 0,
		resolved: totals?.resolved ?? 0,
		byType,
	};
}
