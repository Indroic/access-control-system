import { createContext } from "@access-control-system/api/context";
import { appRouter } from "@access-control-system/api/routers/index";
import { auth } from "@access-control-system/auth";
import { createDb } from "@access-control-system/db";
import { user, oneTimeToken } from "@access-control-system/db/schema/auth";
import { env } from "@access-control-system/env/server";
import { trpcServer } from "@hono/trpc-server";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";
import { EventEmitter } from "events";
import { streamSSE } from "hono/streaming";

const sseEvents = new EventEmitter();
sseEvents.setMaxListeners(100);

const setupAdminSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2),
  secret: z.string(),
});

const app = new Hono();

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
          gt(oneTimeToken.expiresAt, new Date())
        )
      )
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Token has already been used, expired, or is invalid" }, 401);
    }

    const userId = updated[0].userId;
    const userRecord = await db.select().from(user).where(eq(user.id, userId)).limit(1);

    if (userRecord.length === 0) {
      return c.json({ error: "Associated user not found" }, 404);
    }

    // Notificar cambio para actualizar logs
    sseEvents.emit("change");

    return c.json({
      session: {
        user: {
          id: userRecord[0].id,
          email: userRecord[0].email,
          name: userRecord[0].name,
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
  const parsed = setupAdminSchema.safeParse(await c.req.json().catch(() => null));
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

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
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
