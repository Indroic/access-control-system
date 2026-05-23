import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const dbUrl = process.env.DRIZZLE_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/biometric_db";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
