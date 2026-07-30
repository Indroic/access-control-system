import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Nivel de criticidad de una zona controlada. */
export const ZONE_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type ZoneRiskLevel = (typeof ZONE_RISK_LEVELS)[number];

/**
 * Zona o punto de acceso físico. El horario permitido se guarda en minutos
 * desde la medianoche (hora local de `timezone`), lo que permite ventanas
 * nocturnas que cruzan la medianoche (`allowedFromMinute > allowedToMinute`).
 */
export const securityZone = pgTable(
	"security_zone",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		description: text("description"),
		riskLevel: text("risk_level")
			.$type<ZoneRiskLevel>()
			.default("medium")
			.notNull(),
		/** Si es false, la zona es de libre tránsito y no genera incidentes. */
		restricted: boolean("restricted").default(true).notNull(),
		allowedFromMinute: integer("allowed_from_minute").default(480).notNull(),
		allowedToMinute: integer("allowed_to_minute").default(1080).notNull(),
		/** Días habilitados, 0 = domingo … 6 = sábado. */
		allowedDays: jsonb("allowed_days")
			.$type<number[]>()
			.default([1, 2, 3, 4, 5])
			.notNull(),
		timezone: text("timezone").default("America/Caracas").notNull(),
		active: boolean("active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("security_zone_active_idx").on(table.active)],
);

/** Categoría del incidente detectado. */
export const INCIDENT_TYPES = [
	"off_hours_access",
	"restricted_day_access",
	"inactive_zone_access",
	"anomalous_login_hour",
	"unrecognized_face",
	"manual_report",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_SEVERITIES = [
	"low",
	"medium",
	"high",
	"critical",
] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
	"open",
	"acknowledged",
	"resolved",
	"dismissed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/**
 * Incidente de seguridad listo para auditoría.
 *
 * Los campos `*Snapshot` congelan el nombre del usuario y de la zona al momento
 * del hecho: un reporte histórico debe seguir siendo legible aunque después se
 * elimine al empleado o se renombre la zona (las FK usan `set null`).
 */
export const securityIncident = pgTable(
	"security_incident",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** Momento del hecho (fecha y hora exactas que se reportan). */
		occurredAt: timestamp("occurred_at").defaultNow().notNull(),
		/** Momento en que el sistema lo detectó/registró. */
		detectedAt: timestamp("detected_at").defaultNow().notNull(),
		type: text("type").$type<IncidentType>().notNull(),
		severity: text("severity")
			.$type<IncidentSeverity>()
			.default("medium")
			.notNull(),
		status: text("status").$type<IncidentStatus>().default("open").notNull(),
		title: text("title").notNull(),
		/** Explicación descriptiva de lo ocurrido. */
		description: text("description").notNull(),
		userId: text("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		userNameSnapshot: text("user_name_snapshot"),
		userEmailSnapshot: text("user_email_snapshot"),
		zoneId: text("zone_id").references(() => securityZone.id, {
			onDelete: "set null",
		}),
		zoneNameSnapshot: text("zone_name_snapshot"),
		/** Origen del registro: `system`, `kiosk`, `biometric-api`, `manual`. */
		source: text("source").default("system").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		details: jsonb("details")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),
		acknowledgedBy: text("acknowledged_by").references(() => user.id, {
			onDelete: "set null",
		}),
		acknowledgedAt: timestamp("acknowledged_at"),
		resolutionNotes: text("resolution_notes"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("security_incident_occurredAt_idx").on(table.occurredAt),
		index("security_incident_userId_idx").on(table.userId),
		index("security_incident_zoneId_idx").on(table.zoneId),
		index("security_incident_status_idx").on(table.status),
		index("security_incident_type_idx").on(table.type),
	],
);

export const securityZoneRelations = relations(securityZone, ({ many }) => ({
	incidents: many(securityIncident),
}));

export const securityIncidentRelations = relations(
	securityIncident,
	({ one }) => ({
		user: one(user, {
			fields: [securityIncident.userId],
			references: [user.id],
		}),
		zone: one(securityZone, {
			fields: [securityIncident.zoneId],
			references: [securityZone.id],
		}),
	}),
);
