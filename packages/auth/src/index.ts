import { createDb } from "@access-control-system/db";
import * as schema from "@access-control-system/db/schema/auth";
import { env } from "@access-control-system/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
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
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        try {
          const session = ctx.context.session;
          const isSuccess = !!session?.user?.id;
          const userId = session?.user?.id ?? null;

          const req = ctx.request;
          const forwarded = req?.headers?.get("x-forwarded-for");
          const ipAddress =
            forwarded?.split(",")[0]?.trim() ??
            req?.headers?.get("x-real-ip") ??
            null;
          const userAgent = req?.headers?.get("user-agent") ?? null;

          const body = ctx.body as Record<string, unknown>;
          const email = typeof body?.email === "string" ? body.email : null;

          void fetch(`${env.BIOMETRIC_API_URL}/v1/audit/login-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.INTERNAL_API_KEY}`,
            },
            body: JSON.stringify({
              action: isSuccess ? "login_success" : "login_failed",
              user_id: userId,
              ip_address: ipAddress,
              user_agent: userAgent,
              details: {
                method: "email_password",
                ...(!isSuccess && email ? { attempted_email: email } : {}),
              },
            }),
          }).catch((err: unknown) => {
            console.error("[audit] Failed to log login event:", err);
          });
        } catch (err) {
          console.error("[audit] Error in login audit hook:", err);
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            void fetch(`${env.BIOMETRIC_API_URL}/v1/audit/login-event`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.INTERNAL_API_KEY}` },
              body: JSON.stringify({ action: "user_created", user_id: user.id, details: { email: user.email, name: user.name } }),
            }).catch(console.error);
          }
        },
        update: {
          after: async (user) => {
            void fetch(`${env.BIOMETRIC_API_URL}/v1/audit/login-event`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.INTERNAL_API_KEY}` },
              body: JSON.stringify({ action: "user_updated", user_id: user.id, details: { email: user.email, name: user.name, faceRegistered: user.faceRegistered } }),
            }).catch(console.error);
          }
        },
        delete: {
          after: async (user) => {
            void fetch(`${env.BIOMETRIC_API_URL}/v1/audit/login-event`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.INTERNAL_API_KEY}` },
              body: JSON.stringify({ action: "user_deleted", user_id: user.id, details: { email: user.email } }),
            }).catch(console.error);
          }
        }
      }
    }
  });
}

export const auth = createAuth();
