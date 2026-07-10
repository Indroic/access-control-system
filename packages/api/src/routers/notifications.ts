import { createDb } from "@access-control-system/db";
import { pushSubscription } from "@access-control-system/db/schema/notifications";
import { env } from "@access-control-system/env/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const db = createDb();

const ALERT_ROLES = ["admin", "gerente", "jefe"] as const;

const subscriptionInput = z.object({
	endpoint: z.string().url(),
	keys: z.object({
		p256dh: z.string(),
		auth: z.string(),
	}),
});

export const notificationsRouter = router({
	getVapidPublicKey: protectedProcedure.query(() => {
		return { publicKey: env.VAPID_PUBLIC_KEY };
	}),

	subscribe: protectedProcedure
		.input(subscriptionInput)
		.mutation(async ({ ctx, input }) => {
			const role = ctx.session.user.role ?? "user";
			if (!ALERT_ROLES.includes(role as (typeof ALERT_ROLES)[number])) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Tu rol no puede suscribirse a alertas de seguridad.",
				});
			}

			await db
				.insert(pushSubscription)
				.values({
					userId: ctx.session.user.id,
					endpoint: input.endpoint,
					p256dh: input.keys.p256dh,
					auth: input.keys.auth,
				})
				.onConflictDoUpdate({
					target: pushSubscription.endpoint,
					set: {
						userId: ctx.session.user.id,
						p256dh: input.keys.p256dh,
						auth: input.keys.auth,
					},
				});

			return { success: true };
		}),

	unsubscribe: protectedProcedure
		.input(z.object({ endpoint: z.string().url() }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(pushSubscription)
				.where(
					and(
						eq(pushSubscription.endpoint, input.endpoint),
						eq(pushSubscription.userId, ctx.session.user.id),
					),
				);
			return { success: true };
		}),
});
