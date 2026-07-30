import { Card, Chip, Separator } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "#/components/app-shell";
import {
	actionTag,
	EmptyState,
	formatDateTime,
	LoadingRow,
	Readout,
} from "#/components/panel-bits";
import { normalizeRole, SUPERVISOR_ROLES } from "#/lib/navigation";
import { trpcQuery } from "#/lib/trpc";
import { authClient } from "#/utils/auth-client";

export const Route = createFileRoute("/_panel/dashboard")({
	component: DashboardPage,
});

type Employee = {
	id: string;
	name: string;
	faceRegistered: boolean;
};

type AuditLog = {
	id: string;
	action: string;
	created_at?: string;
	createdAt?: string;
	user?: { name: string; email: string } | null;
};

type IncidentSummary = {
	id: string;
	title: string;
	severity: string;
	status: string;
	occurredAt: string;
	zoneName: string | null;
	userName: string | null;
};

const SEVERITY_COLOR: Record<
	string,
	"default" | "accent" | "success" | "warning" | "danger"
> = {
	low: "success",
	medium: "warning",
	high: "warning",
	critical: "danger",
};

function DashboardPage() {
	const { data: sessionData } = authClient.useSession();
	const role = normalizeRole(
		(sessionData?.user as { role?: string } | undefined)?.role,
	);
	const isSupervisor = (SUPERVISOR_ROLES as string[]).includes(role);

	const { data: employees = [], isLoading: employeesLoading } = useQuery({
		queryKey: ["employees"],
		queryFn: () => trpcQuery<Employee[]>("users.list"),
		enabled: isSupervisor,
	});

	const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
		queryKey: ["auditLogs"],
		queryFn: () => trpcQuery<AuditLog[]>("audit.list"),
		enabled: isSupervisor,
	});

	const { data: stats } = useQuery({
		queryKey: ["incidentStats", "dashboard"],
		queryFn: () =>
			trpcQuery<{
				total: number;
				open: number;
				critical: number;
				high: number;
				resolved: number;
			}>("security.incidents.stats", {}),
		enabled: isSupervisor,
	});

	const { data: recentIncidents = [] } = useQuery({
		queryKey: ["incidents", "dashboard"],
		queryFn: () =>
			trpcQuery<IncidentSummary[]>("security.incidents.list", { limit: 5 }),
		enabled: isSupervisor,
	});

	if (!isSupervisor) {
		return (
			<>
				<PageHeader
					title="Panel general"
					subtitle="Tu rol tiene acceso al punto de control biométrico."
				/>
				<Card variant="default">
					<Card.Content>
						<EmptyState
							icon={<ShieldCheck size={22} className="text-muted" />}
							title="Acceso restringido"
							body="Las vistas de personal, bitácora e incidentes están reservadas a jefatura, gerencia y administración. Usa el kiosco de acceso desde el menú lateral."
						/>
					</Card.Content>
				</Card>
			</>
		);
	}

	const enrolled = employees.filter((e) => e.faceRegistered).length;
	const recentLogs = auditLogs.slice(0, 8);
	const loading = employeesLoading || auditLoading;

	return (
		<>
			<PageHeader
				title="Panel general"
				subtitle="Lectura del instrumento en tiempo real."
			/>

			<Card variant="default" className="mb-6">
				<Card.Content className="grid grid-cols-2 gap-y-4 sm:grid-cols-5 sm:divide-x sm:divide-separator">
					<Readout label="Sujetos" value={employees.length} />
					<Readout label="Con biometría" value={enrolled} tone="accent" />
					<Readout label="Eventos" value={auditLogs.length} />
					<Readout
						label="Incidentes abiertos"
						value={stats?.open ?? 0}
						tone="pending"
					/>
					<Readout label="Críticos" value={stats?.critical ?? 0} tone="deny" />
				</Card.Content>
			</Card>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* ── Incidentes recientes ── */}
				<Card variant="default">
					<Card.Header>
						<div className="flex items-center justify-between gap-3">
							<Card.Title className="font-display text-base">
								Incidentes recientes
							</Card.Title>
							<Link
								to="/incidentes"
								className="text-accent text-xs hover:underline"
							>
								Ver todos
							</Link>
						</div>
					</Card.Header>
					<Card.Content className="p-0">
						{recentIncidents.length === 0 ? (
							<EmptyState
								icon={<ShieldCheck size={22} className="text-success" />}
								title="Sin incidentes registrados"
								body="No se han detectado accesos fuera de horario ni validaciones de seguridad fallidas."
							/>
						) : (
							<ul className="divide-y divide-separator">
								{recentIncidents.map((incident) => (
									<li key={incident.id} className="flex gap-3 px-4 py-3">
										<Chip
											color={SEVERITY_COLOR[incident.severity] ?? "default"}
											variant="soft"
											size="sm"
											className="mt-0.5 shrink-0"
										>
											<Chip.Label>{incident.severity}</Chip.Label>
										</Chip>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-foreground text-sm">
												{incident.title}
											</p>
											<p className="readout mt-0.5 text-[11px] text-muted">
												{formatDateTime(incident.occurredAt)}
												{incident.userName ? ` · ${incident.userName}` : ""}
											</p>
										</div>
									</li>
								))}
							</ul>
						)}
					</Card.Content>
				</Card>

				{/* ── Últimos eventos ── */}
				<Card variant="default">
					<Card.Header>
						<div className="flex items-center justify-between gap-3">
							<Card.Title className="font-display text-base">
								Últimos eventos
							</Card.Title>
							<Link
								to="/bitacora"
								className="text-accent text-xs hover:underline"
							>
								Ver bitácora
							</Link>
						</div>
					</Card.Header>
					<Card.Content className="p-0">
						{loading && recentLogs.length === 0 ? (
							<LoadingRow />
						) : recentLogs.length === 0 ? (
							<EmptyState
								title="Sin eventos registrados"
								body="Cada intento de acceso y enrolamiento aparecerá aquí."
							/>
						) : (
							<ul className="divide-y divide-separator">
								{recentLogs.map((log) => {
									const tag = actionTag(log.action);
									return (
										<li
											key={log.id}
											className="flex items-center gap-3 px-4 py-3"
										>
											<Chip
												color={tag.color}
												variant="soft"
												size="sm"
												className="shrink-0"
											>
												<Chip.Label>{tag.label}</Chip.Label>
											</Chip>
											<span className="min-w-0 flex-1 truncate text-foreground text-sm">
												{log.user?.name ?? "Acción del sistema"}
											</span>
											<span className="readout shrink-0 text-[11px] text-muted">
												{formatDateTime(log.created_at ?? log.createdAt)}
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</Card.Content>
				</Card>
			</div>

			<Separator className="my-6" />
			<div className="flex flex-wrap items-center justify-between gap-3">
				<span className="telemetry">
					Operador ·{" "}
					<span className="readout text-foreground">
						{sessionData?.user?.name ?? "—"}
					</span>
				</span>
				<span className="telemetry">Nodo CAF-01 · sesión activa</span>
			</div>
		</>
	);
}
