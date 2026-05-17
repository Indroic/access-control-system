import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const dbUrl = process.env.DRIZZLE_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error(
    "DRIZZLE_DATABASE_URL is not set. Set it in environment or create a matching .env file"
  );
}

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
