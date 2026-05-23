import { createDb } from "@access-control-system/db";
import { oneTimeToken } from "@access-control-system/db/schema/auth";
import { protectedProcedure, router } from "../index";

const db = createDb();

export const doorRouter = router({
  generateOneTimeToken: protectedProcedure.mutation(async ({ ctx }) => {
    const token = `ott_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + 30 * 1000); // Expiración en 30 segundos

    await db.insert(oneTimeToken).values({
      id: crypto.randomUUID(),
      token,
      userId: ctx.session.user.id,
      expiresAt,
      used: false,
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }),
});
