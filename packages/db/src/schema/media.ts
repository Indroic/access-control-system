import { relations } from "drizzle-orm";
import {
	customType,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * `bytea` no tiene helper propio en drizzle-orm/pg-core. node-postgres ya
 * devuelve/acepta Buffer para esta columna, así que el tipo personalizado solo
 * declara el tipo SQL.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
});

/** Naturaleza de la imagen: define cómo se agrupa en la galería del perfil. */
export const USER_IMAGE_KINDS = [
	"enrollment",
	"profile",
	"document",
	"access_capture",
] as const;
export type UserImageKind = (typeof USER_IMAGE_KINDS)[number];

/** Pose capturada durante el enrolamiento biométrico (null en otros tipos). */
export const USER_IMAGE_POSES = ["front", "right", "left"] as const;
export type UserImagePose = (typeof USER_IMAGE_POSES)[number];

/**
 * Evidencia fotográfica asociada a un usuario. Los bytes viven en Postgres:
 * son pocas imágenes por persona (3 poses de enrolamiento) y así el respaldo de
 * la base cubre también la evidencia, sin volúmenes ni almacenamiento externo.
 */
export const userImage = pgTable(
	"user_image",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind").$type<UserImageKind>().default("enrollment").notNull(),
		pose: text("pose").$type<UserImagePose | null>().default(null),
		label: text("label"),
		contentType: text("content_type").default("image/jpeg").notNull(),
		byteSize: integer("byte_size").notNull(),
		data: bytea("data").notNull(),
		/** Usuario que realizó la captura (operador), si se informó. */
		capturedBy: text("captured_by").references(() => user.id, {
			onDelete: "set null",
		}),
		source: text("source").default("face-enrollment").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("user_image_userId_idx").on(table.userId),
		index("user_image_createdAt_idx").on(table.createdAt),
	],
);

export const userImageRelations = relations(userImage, ({ one }) => ({
	user: one(user, {
		fields: [userImage.userId],
		references: [user.id],
	}),
}));
