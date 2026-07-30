import type { LinkProps } from "@tanstack/react-router";
import {
	DoorOpen,
	LayoutDashboard,
	type LucideIcon,
	ScanFace,
	ScrollText,
	ShieldAlert,
	Users,
} from "lucide-react";

export type AppRole = "user" | "jefe" | "gerente" | "admin";

export const ALL_ROLES: AppRole[] = ["user", "jefe", "gerente", "admin"];

/** Roles con mando sobre el personal y la información de seguridad. */
export const SUPERVISOR_ROLES: AppRole[] = ["jefe", "gerente", "admin"];

export const ROLE_LABEL: Record<string, string> = {
	user: "Empleado",
	jefe: "Jefe",
	gerente: "Gerente",
	admin: "Administrador",
};

export type NavItem = {
	to: LinkProps["to"];
	label: string;
	description: string;
	icon: LucideIcon;
	/** Roles que ven la opción; el resto ni siquiera la recibe en el DOM. */
	roles: AppRole[];
};

export type NavSection = {
	title: string;
	items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
	{
		title: "Operación",
		items: [
			{
				to: "/dashboard",
				label: "Panel general",
				description: "Resumen del estado del sistema",
				icon: LayoutDashboard,
				roles: ALL_ROLES,
			},
			{
				to: "/personal",
				label: "Personal",
				description: "Empleados, roles y evidencia de registro",
				icon: Users,
				roles: SUPERVISOR_ROLES,
			},
			{
				to: "/bitacora",
				label: "Bitácora",
				description: "Registro de eventos en tiempo real",
				icon: ScrollText,
				roles: SUPERVISOR_ROLES,
			},
		],
	},
	{
		title: "Seguridad",
		items: [
			{
				to: "/incidentes",
				label: "Incidentes",
				description: "Validaciones de seguridad y reportes",
				icon: ShieldAlert,
				roles: SUPERVISOR_ROLES,
			},
			{
				to: "/zonas",
				label: "Zonas y horarios",
				description: "Puntos de acceso y turnos permitidos",
				icon: DoorOpen,
				roles: ["admin"],
			},
		],
	},
	{
		title: "Terreno",
		items: [
			{
				to: "/access",
				label: "Kiosco de acceso",
				description: "Punto de control biométrico",
				icon: ScanFace,
				roles: ALL_ROLES,
			},
		],
	},
];

export function normalizeRole(role: string | null | undefined): AppRole {
	return (ALL_ROLES as string[]).includes(role ?? "")
		? (role as AppRole)
		: "user";
}

export function canAccess(item: NavItem, role: string | null | undefined) {
	return item.roles.includes(normalizeRole(role));
}

/** Secciones filtradas por rol; se descartan las que quedan sin opciones. */
export function sectionsForRole(role: string | null | undefined): NavSection[] {
	return NAV_SECTIONS.map((section) => ({
		...section,
		items: section.items.filter((item) => canAccess(item, role)),
	})).filter((section) => section.items.length > 0);
}
