import { Avatar, Button, Chip, toast } from "@heroui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	Bell,
	BellOff,
	ChevronsLeft,
	ChevronsRight,
	LogOut,
	Menu,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AccessMark, ThemeToggle } from "#/components/hud";
import { usePushNotifications } from "#/hooks/use-push-notifications";
import {
	normalizeRole,
	ROLE_LABEL,
	SUPERVISOR_ROLES,
	sectionsForRole,
} from "#/lib/navigation";
import { authClient } from "#/utils/auth-client";

const COLLAPSE_KEY = "acs.sidebar.collapsed";

function initials(name?: string | null) {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

type SessionUser = {
	id: string;
	name: string;
	email: string;
	role?: string | null;
};

/* ── Navegación ──────────────────────────────────────────────────────────── */

const NAV_BASE =
	"group relative flex items-center gap-3 rounded-md px-3 py-2 font-medium text-muted text-sm transition-colors hover:bg-surface-secondary hover:text-foreground";
const NAV_ACTIVE =
	"bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft hover:text-accent-soft-foreground";

function NavLinks({
	role,
	collapsed,
	onNavigate,
}: {
	role: string | null | undefined;
	collapsed: boolean;
	onNavigate?: () => void;
}) {
	const sections = useMemo(() => sectionsForRole(role), [role]);

	return (
		<nav className="flex flex-col gap-5" aria-label="Navegación principal">
			{sections.map((section) => (
				<div key={section.title}>
					{!collapsed && <p className="telemetry mb-2 px-3">{section.title}</p>}
					<ul className="flex flex-col gap-0.5">
						{section.items.map((item) => {
							const Icon = item.icon;
							return (
								<li key={String(item.to)}>
									<Link
										to={item.to}
										onClick={onNavigate}
										title={collapsed ? item.label : undefined}
										className={`${NAV_BASE} ${collapsed ? "justify-center px-0" : ""}`}
										activeProps={{ className: NAV_ACTIVE }}
										activeOptions={{ exact: false }}
									>
										{/* Marca de ruta activa en el borde izquierdo */}
										<span
											aria-hidden="true"
											className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-current opacity-0 transition-opacity group-aria-[current=page]:opacity-100"
										/>
										<Icon size={17} className="shrink-0" />
										{!collapsed && (
											<span className="truncate">{item.label}</span>
										)}
									</Link>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</nav>
	);
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
	return (
		<div
			className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}
		>
			<span className="text-accent">
				<AccessMark size={24} />
			</span>
			{!collapsed && (
				<span className="leading-none">
					<span className="block font-bold font-display text-[13px] text-foreground tracking-tight">
						Control de Acceso
					</span>
					<span className="telemetry mt-1 block">Termografía</span>
				</span>
			)}
		</div>
	);
}

function SidebarFooter({
	user,
	collapsed,
}: {
	user: SessionUser | null;
	collapsed: boolean;
}) {
	if (collapsed) {
		return (
			<div className="flex justify-center" title={user?.name ?? undefined}>
				<Avatar className="size-8">
					<Avatar.Fallback className="text-[11px]">
						{initials(user?.name)}
					</Avatar.Fallback>
				</Avatar>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2.5">
			<Avatar className="size-8 shrink-0">
				<Avatar.Fallback className="text-[11px]">
					{initials(user?.name)}
				</Avatar.Fallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-sm">
					{user?.name ?? "—"}
				</p>
				<p className="truncate text-[11px] text-muted">
					{ROLE_LABEL[normalizeRole(user?.role)]}
				</p>
			</div>
		</div>
	);
}

/* ── Cascarón ────────────────────────────────────────────────────────────── */

export type AppShellProps = {
	children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
	const navigate = useNavigate();
	const { data: sessionData } = authClient.useSession();
	const sessionUser = (sessionData?.user ?? null) as SessionUser | null;
	const role = normalizeRole(sessionUser?.role);

	const [collapsed, setCollapsed] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);

	// El estado plegado se rehidrata en el cliente para no romper el SSR.
	useEffect(() => {
		try {
			setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
		} catch {}
	}, []);

	const toggleCollapsed = useCallback(() => {
		setCollapsed((previous) => {
			const next = !previous;
			try {
				window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
			} catch {}
			return next;
		});
	}, []);

	// El drawer móvil se cierra con Escape.
	useEffect(() => {
		if (!drawerOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setDrawerOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [drawerOpen]);

	const push = usePushNotifications();
	const canReceiveAlerts = (SUPERVISOR_ROLES as string[]).includes(role);

	async function handleTogglePush() {
		try {
			if (push.isSubscribed) {
				await push.unsubscribe();
				toast.success("Alertas de seguridad desactivadas.");
			} else {
				await push.subscribe();
				toast.success("Alertas de seguridad activadas.");
			}
		} catch (error) {
			toast.danger(
				error instanceof Error
					? error.message
					: "No se pudieron actualizar las alertas.",
			);
		}
	}

	async function handleLogout() {
		await authClient.signOut();
		navigate({ to: "/" });
	}

	const sidebarWidth = collapsed ? "lg:w-[4.5rem]" : "lg:w-64";

	return (
		<div className="min-h-screen">
			{/* ── Sidebar de escritorio ── */}
			<aside
				className={`fixed inset-y-0 left-0 z-30 hidden shrink-0 flex-col border-separator border-r bg-surface lg:flex ${sidebarWidth} transition-[width] duration-200`}
			>
				<div className="flex h-16 items-center border-separator border-b px-4">
					<SidebarBrand collapsed={collapsed} />
				</div>

				<div className="flex-1 overflow-y-auto px-3 py-5">
					<NavLinks role={role} collapsed={collapsed} />
				</div>

				<div className="border-separator border-t px-3 py-3">
					<SidebarFooter user={sessionUser} collapsed={collapsed} />
					<Button
						onPress={toggleCollapsed}
						variant="tertiary"
						size="sm"
						className={`mt-2 w-full gap-2 ${collapsed ? "justify-center" : "justify-start"}`}
						aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
					>
						{collapsed ? (
							<ChevronsRight size={16} />
						) : (
							<>
								<ChevronsLeft size={16} />
								<span className="text-xs">Contraer</span>
							</>
						)}
					</Button>
				</div>
			</aside>

			{/* ── Drawer móvil ── */}
			{drawerOpen && (
				<div className="fixed inset-0 z-50 lg:hidden">
					<button
						type="button"
						aria-label="Cerrar menú"
						className="absolute inset-0 bg-backdrop"
						onClick={() => setDrawerOpen(false)}
					/>
					<div className="fade-rise relative flex h-full w-[17rem] max-w-[85vw] flex-col border-separator border-r bg-surface">
						<div className="flex h-16 items-center justify-between border-separator border-b px-4">
							<SidebarBrand collapsed={false} />
							<Button
								onPress={() => setDrawerOpen(false)}
								variant="tertiary"
								size="sm"
								isIconOnly
								aria-label="Cerrar menú"
							>
								<X size={16} />
							</Button>
						</div>
						<div className="flex-1 overflow-y-auto px-3 py-5">
							<NavLinks
								role={role}
								collapsed={false}
								onNavigate={() => setDrawerOpen(false)}
							/>
						</div>
						<div className="border-separator border-t px-3 py-3">
							<SidebarFooter user={sessionUser} collapsed={false} />
						</div>
					</div>
				</div>
			)}

			{/* ── Contenido ── */}
			<div
				className={`${collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"} transition-[padding] duration-200`}
			>
				<header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-separator border-b bg-surface/85 px-4 backdrop-blur sm:px-6">
					<Button
						onPress={() => setDrawerOpen(true)}
						variant="tertiary"
						size="sm"
						isIconOnly
						className="lg:hidden"
						aria-label="Abrir menú de navegación"
					>
						<Menu size={18} />
					</Button>

					<Chip
						color="accent"
						variant="soft"
						size="sm"
						className="hidden sm:flex"
					>
						<span className="pulse-dot inline-block size-1.5 rounded-full bg-current" />
						<Chip.Label>
							<span className="font-mono text-[10px] uppercase tracking-[0.12em]">
								Nodo CAF-01
							</span>
						</Chip.Label>
					</Chip>

					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />
						{canReceiveAlerts && push.isSupported && (
							<Button
								onPress={handleTogglePush}
								variant="secondary"
								size="sm"
								className="gap-2"
								aria-label={
									push.isSubscribed
										? "Silenciar alertas de seguridad"
										: "Activar alertas de seguridad"
								}
							>
								{push.isSubscribed ? <BellOff size={15} /> : <Bell size={15} />}
								<span className="hidden sm:inline">
									{push.isSubscribed ? "Silenciar" : "Alertas"}
								</span>
							</Button>
						)}
						<Button
							onPress={handleLogout}
							variant="danger"
							size="sm"
							className="gap-2"
						>
							<LogOut size={15} />
							<span className="hidden sm:inline">Salir</span>
						</Button>
					</div>
				</header>

				<main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
			</div>
		</div>
	);
}

/** Encabezado uniforme para cada vista del panel. */
export function PageHeader({
	title,
	subtitle,
	actions,
}: {
	title: string;
	subtitle?: string;
	actions?: React.ReactNode;
}) {
	return (
		<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 className="font-bold font-display text-foreground text-xl tracking-tight">
					{title}
				</h1>
				{subtitle && <p className="mt-1 text-muted text-sm">{subtitle}</p>}
			</div>
			{actions && (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			)}
		</div>
	);
}
