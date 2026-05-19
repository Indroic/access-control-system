import { createContext } from "@access-control-system/api/context";
import { appRouter } from "@access-control-system/api/routers/index";
import { auth } from "@access-control-system/auth";
import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";
import { env } from "@access-control-system/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/setup-status", async (c) => {
  const db = createDb();
  const existing = await db.select({ id: user.id }).from(user).limit(1);
  return c.json({ needsSetup: existing.length === 0 });
});

app.post("/setup-admin", async (c) => {
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
  });
  await authContext.internalAdapter.createAccount({
    userId: newUser.id,
    providerId: "credential",
    accountId: newUser.id,
    password: hashedPassword,
  });

  return c.json({ success: true });
});

app.use(
  "/trpc/*",
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
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
