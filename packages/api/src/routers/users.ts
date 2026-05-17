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
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.createdAt);
  }),

  delete: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(user).where(eq(user.id, input.userId));
      return { success: true };
    }),
});
