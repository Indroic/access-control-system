import { createDb } from "@access-control-system/db";
import * as schema from "@access-control-system/db/schema/auth";
import { env } from "@access-control-system/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { faceBiometricsPlugin } from "./plugins/biometric";
import { admin } from "better-auth/plugins/admin";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      faceBiometricsPlugin(),
      admin(),
    ],
  });
}

export const auth = createAuth();
