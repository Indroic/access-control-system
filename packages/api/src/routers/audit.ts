import { desc, eq } from "drizzle-orm";

import { createDb } from "@access-control-system/db";
import { auditLog } from "@access-control-system/db/schema/audit";
import { user } from "@access-control-system/db/schema/auth";

import { protectedProcedure, router } from "../index";

const db = createDb();

export const auditRouter = router({
  list: protectedProcedure.query(async () => {
    return db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        details: auditLog.details,
        createdAt: auditLog.createdAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(auditLog)
      .leftJoin(user, eq(auditLog.userId, user.id))
      .orderBy(desc(auditLog.createdAt));
  }),
});
