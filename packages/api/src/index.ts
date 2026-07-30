import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "No session",
		});
	}
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});

/** Roles con visibilidad sobre el módulo de seguridad y sus reportes. */
export const SECURITY_ROLES = ["admin", "gerente", "jefe"] as const;

function requireRole(allowed: readonly string[], message: string) {
	return protectedProcedure.use(({ ctx, next }) => {
		const role = ctx.session.user.role ?? "user";
		if (!allowed.includes(role)) {
			throw new TRPCError({ code: "FORBIDDEN", message });
		}
		return next({ ctx });
	});
}

/** Consulta y gestión de incidentes: administración, gerencia y jefatura. */
export const securityProcedure = requireRole(
	SECURITY_ROLES,
	"Tu rol no tiene acceso al módulo de seguridad.",
);

/** Operaciones de configuración reservadas a administración. */
export const adminProcedure = requireRole(
	["admin"],
	"Esta operación requiere permisos de administrador.",
);
