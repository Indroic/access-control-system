import { Avatar, Button, Card, Chip, Table } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { PageHeader } from "#/components/app-shell";
import {
	actionTag,
	EmptyState,
	formatDateTime,
	initials,
	LoadingRow,
} from "#/components/panel-bits";
import { trpcQuery } from "#/lib/trpc";

export const Route = createFileRoute("/_panel/bitacora")({
	component: BitacoraPage,
});

type AuditLog = {
	id: string;
	action: string;
	created_at?: string;
	createdAt?: string;
	ipAddress?: string | null;
	ip_address?: string | null;
	user?: { name: string; email: string } | null;
	details?: Record<string, unknown> | null;
};

function latency(details: Record<string, unknown> | null | undefined) {
	if (!details) return null;
	const value = details.latency_ms;
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function BitacoraPage() {
	const {
		data: logs = [],
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["auditLogs"],
		queryFn: () => trpcQuery<AuditLog[]>("audit.list"),
	});

	return (
		<>
			<PageHeader
				title="Bitácora"
				subtitle="Registro de eventos del sistema en tiempo real."
				actions={
					<Button
						onPress={() => refetch()}
						variant="secondary"
						size="sm"
						className="gap-2"
					>
						<RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
						Actualizar
					</Button>
				}
			/>

			<Card variant="default">
				<Card.Header>
					<div className="flex items-center justify-between">
						<Card.Title className="font-display text-base">
							Registro de eventos
						</Card.Title>
						<Chip color="accent" variant="soft" size="sm">
							<span className="pulse-dot inline-block size-1.5 rounded-full bg-current" />
							<Chip.Label>
								<span className="font-mono text-[10px] uppercase tracking-[0.12em]">
									En vivo · SSE
								</span>
							</Chip.Label>
						</Chip>
					</div>
				</Card.Header>
				<Card.Content className="p-0">
					{isLoading && logs.length === 0 ? (
						<LoadingRow />
					) : logs.length === 0 ? (
						<EmptyState
							title="Sin eventos registrados"
							body="Cada intento de acceso, enrolamiento y apertura aparecerá aquí en tiempo real."
						/>
					) : (
						<Table>
							<Table.ScrollContainer>
								<Table.Content
									aria-label="Registro de eventos"
									className="min-w-[820px]"
								>
									<Table.Header>
										<Table.Column isRowHeader>Marca de tiempo</Table.Column>
										<Table.Column>Evento</Table.Column>
										<Table.Column>Persona</Table.Column>
										<Table.Column>Origen</Table.Column>
										<Table.Column className="text-right">Latencia</Table.Column>
									</Table.Header>
									<Table.Body>
										{logs.map((log) => {
											const tag = actionTag(log.action);
											const ms = latency(log.details);
											const samples = log.details?.samples_count;
											return (
												<Table.Row key={log.id} id={log.id}>
													<Table.Cell className="readout py-3 text-[11px] text-muted">
														{formatDateTime(log.created_at ?? log.createdAt)}
													</Table.Cell>
													<Table.Cell className="py-3">
														<Chip color={tag.color} variant="soft" size="sm">
															<Chip.Label>{tag.label}</Chip.Label>
														</Chip>
													</Table.Cell>
													<Table.Cell className="py-3">
														{log.user ? (
															<div className="flex items-center gap-2.5">
																<Avatar className="size-6 shrink-0">
																	<Avatar.Fallback className="text-[10px]">
																		{initials(log.user.name)}
																	</Avatar.Fallback>
																</Avatar>
																<div className="flex flex-col">
																	<span className="font-medium text-foreground text-sm">
																		{log.user.name}
																	</span>
																	<span className="readout text-[10px] text-muted">
																		{log.user.email}
																	</span>
																</div>
															</div>
														) : (
															<span className="text-muted text-sm">
																Acción del sistema
															</span>
														)}
													</Table.Cell>
													<Table.Cell className="readout py-3 text-[11px] text-muted">
														{log.ipAddress ?? log.ip_address ?? "127.0.0.1"}
													</Table.Cell>
													<Table.Cell className="py-3 text-right">
														{ms !== null ? (
															<span className="readout text-[11px] text-foreground">
																{ms.toFixed(1)}
																<span className="text-muted"> ms</span>
															</span>
														) : samples ? (
															<span className="readout text-[11px] text-muted">
																{String(samples)} capt.
															</span>
														) : (
															<span className="readout text-[11px] text-muted">
																—
															</span>
														)}
													</Table.Cell>
												</Table.Row>
											);
										})}
									</Table.Body>
								</Table.Content>
							</Table.ScrollContainer>
						</Table>
					)}
				</Card.Content>
			</Card>
		</>
	);
}
