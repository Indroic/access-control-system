import { protectedProcedure, publicProcedure, router } from "../index";
import { auditRouter } from "./audit";
import { doorRouter } from "./door";
import { usersRouter } from "./users";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	users: usersRouter,
	door: doorRouter,
	audit: auditRouter,
});

export type AppRouter = typeof appRouter;
