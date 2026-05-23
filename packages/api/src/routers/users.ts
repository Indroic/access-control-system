import { eq } from "drizzle-orm";
import { z } from "zod";

import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";

import { protectedProcedure, router } from "../index";

const db = createDb();

export const usersRouter = router({
  list: protectedProcedure.query(async () => {
    return db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        faceRegistered: user.faceRegistered,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.createdAt);
  }),

  delete: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      const targetUser = await db.select({ role: user.role }).from(user).where(eq(user.id, input.userId)).limit(1);
      if (targetUser.length > 0 && targetUser[0].role === "admin") {
        throw new Error("No está permitido eliminar a un administrador del sistema.");
      }
      await db.delete(user).where(eq(user.id, input.userId));
      return { success: true };
    }),
});
