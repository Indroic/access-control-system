import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";
import { userImage } from "@access-control-system/db/schema/media";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const db = createDb();

/**
 * Los bytes de cada imagen se sirven por streaming desde el servidor Hono
 * (`apps/server`), no por tRPC: mantiene el JSON liviano y permite que el
 * navegador cachee cada miniatura como recurso normal.
 */
function imageUrl(imageId: string) {
	return `/api/media/user-images/${imageId}`;
}

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
				imageCount: sql<number>`count(${userImage.id})::int`,
			})
			.from(user)
			.leftJoin(userImage, eq(userImage.userId, user.id))
			.groupBy(user.id)
			.orderBy(user.createdAt);
	}),

	/** Ficha completa de un usuario, con su evidencia fotográfica de registro. */
	detail: protectedProcedure
		.input(z.object({ userId: z.string().min(1) }))
		.query(async ({ input }) => {
			const [target] = await db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					image: user.image,
					faceRegistered: user.faceRegistered,
					faceMeta: user.faceMeta,
					role: user.role,
					banned: user.banned,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				})
				.from(user)
				.where(eq(user.id, input.userId))
				.limit(1);

			if (!target) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "El usuario solicitado no existe.",
				});
			}

			const images = await db
				.select({
					id: userImage.id,
					kind: userImage.kind,
					pose: userImage.pose,
					label: userImage.label,
					contentType: userImage.contentType,
					byteSize: userImage.byteSize,
					source: userImage.source,
					capturedBy: userImage.capturedBy,
					createdAt: userImage.createdAt,
				})
				.from(userImage)
				.where(eq(userImage.userId, input.userId))
				.orderBy(desc(userImage.createdAt));

			return {
				user: target,
				images: images.map((img) => ({ ...img, url: imageUrl(img.id) })),
			};
		}),

	delete: protectedProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input }) => {
			const targetUser = await db
				.select({ role: user.role })
				.from(user)
				.where(eq(user.id, input.userId))
				.limit(1);
			if (targetUser.length > 0 && targetUser[0]?.role === "admin") {
				throw new Error(
					"No está permitido eliminar a un administrador del sistema.",
				);
			}
			await db.delete(user).where(eq(user.id, input.userId));
			return { success: true };
		}),
});
