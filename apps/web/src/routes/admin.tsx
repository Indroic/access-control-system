import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * La antigua consola `/admin` se dividió en las vistas del panel lateral
 * (`/dashboard`, `/personal`, `/bitacora`, …). La ruta se conserva como
 * redirección para no romper enlaces ni sesiones ya abiertas.
 */
export const Route = createFileRoute("/admin")({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard" });
	},
});
