import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const dbUrl =
	process.env.DRIZZLE_DATABASE_URL ||
	process.env.DATABASE_URL ||
	"postgresql://postgres:password@localhost:5432/biometric_db";

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: dbUrl,
	},
	// La misma base de datos aloja tablas ajenas a Drizzle (administradas por
	// Alembic en apps/biometric-api: user_faces, biometric_audit_log,
	// alembic_version). Sin este filtro, `db:push` las introspecciona igual,
	// las ve como "a borrar" y pregunta interactivamente si alguna tabla nueva
	// es un rename de ellas — lo que rompe en entornos sin TTY (CI/Docker).
	tablesFilter: [
		"user",
		"session",
		"account",
		"verification",
		"one_time_token",
		"audit_log",
		"push_subscription",
	],
});
