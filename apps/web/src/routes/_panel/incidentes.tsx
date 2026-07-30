import {
	Alert,
	Button,
	Card,
	Chip,
	Input,
	Label,
	Modal,
	Separator,
	Table,
	TextField,
	toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	FileSpreadsheet,
	FileText,
	FilterX,
	Plus,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "#/components/app-shell";
import {
	EmptyState,
	formatDateOnly,
	formatDateTime,
	formatTimeOnly,
	LoadingRow,
	Readout,
} from "#/components/panel-bits";
import { buildQueryString, trpcMutate, trpcQuery } from "#/lib/trpc";

export const Route = createFileRoute("/_panel/incidentes")({
	component: IncidentesPage,
});

/* ── Catálogos ───────────────────────────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
	off_hours_access: "Acceso fuera de horario",
	restricted_day_access: "Acceso en día no habilitado",
	inactive_zone_access: "Acceso a zona fuera de servicio",
	anomalous_login_hour: "Hora de ingreso anómala",
	unrecognized_face: "Rostro no reconocido",
	manual_report: "Reporte manual",
};

const SEVERITY_LABELS: Record<string, string> = {
	low: "Baja",
	medium: "Media",
	high: "Alta",
	critical: "Crítica",
};

const STATUS_LABELS: Record<string, string> = {
	open: "Abierto",
	acknowledged: "En revisión",
	resolved: "Resuelto",
	dismissed: "Descartado",
};

type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

const SEVERITY_COLOR: Record<string, ChipColor> = {
	low: "success",
	medium: "warning",
	high: "warning",
	critical: "danger",
};

const STATUS_COLOR: Record<string, ChipColor> = {
	open: "danger",
	acknowledged: "warning",
	resolved: "success",
	dismissed: "default",
};

type Incident = {
	id: string;
	occurredAt: string;
	detectedAt: string;
	type: string;
	severity: string;
	status: string;
	title: string;
	description: string;
	userId: string | null;
	userName: string | null;
	userEmail: string | null;
	zoneId: string | null;
	zoneName: string | null;
	zoneCode: string | null;
	source: string;
	ipAddress: string | null;
	resolutionNotes: string | null;
};

type Zone = { id: string; name: string; code: string };
type Employee = { id: string; name: string; email: string };

type Filters = {
	from: string;
	to: string;
	zoneId: string;
	userId: string;
	type: string;
	severity: string;
	status: string;
	search: string;
};

const EMPTY_FILTERS: Filters = {
	from: "",
	to: "",
	zoneId: "",
	userId: "",
	type: "",
	severity: "",
	status: "",
	search: "",
};

/** Descarta los campos vacíos: el backend trata `undefined` como "sin filtro". */
function toQueryInput(filters: Filters) {
	const input: Record<string, string | number> = { limit: 500 };
	if (filters.from) input.from = `${filters.from}T00:00:00.000`;
	if (filters.to) input.to = `${filters.to}T23:59:59.999`;
	if (filters.zoneId) input.zoneId = filters.zoneId;
	if (filters.userId) input.userId = filters.userId;
	if (filters.type) input.type = filters.type;
	if (filters.severity) input.severity = filters.severity;
	if (filters.status) input.status = filters.status;
	if (filters.search.trim()) input.search = filters.search.trim();
	return input;
}

/* ── Campos auxiliares ───────────────────────────────────────────────────── */

function DateField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="flex flex-col">
			<span className="telemetry mb-1.5">{label}</span>
			<input
				type="date"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 text-field-foreground text-sm outline-none focus:border-focus"
			/>
		</label>
	);
}

function PickerField({
	label,
	value,
	onChange,
	options,
	placeholder = "Todos",
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: { id: string; label: string }[];
	placeholder?: string;
}) {
	return (
		<label className="flex flex-col">
			<span className="telemetry mb-1.5">{label}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2 text-field-foreground text-sm outline-none focus:border-focus"
			>
				<option value="">{placeholder}</option>
				{options.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

/* ── Vista ───────────────────────────────────────────────────────────────── */

function IncidentesPage() {
	const queryClient = useQueryClient();
	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [selected, setSelected] = useState<Incident | null>(null);
	const [showManual, setShowManual] = useState(false);

	const queryInput = useMemo(() => toQueryInput(filters), [filters]);
	const exportQuery = useMemo(() => {
		const timeZone =
			Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Caracas";
		return buildQueryString({
			from: filters.from || undefined,
			to: filters.to || undefined,
			zoneId: filters.zoneId || undefined,
			userId: filters.userId || undefined,
			type: filters.type || undefined,
			severity: filters.severity || undefined,
			status: filters.status || undefined,
			search: filters.search.trim() || undefined,
			tz: timeZone,
		});
	}, [filters]);

	const {
		data: incidents = [],
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["incidents", queryInput],
		queryFn: () => trpcQuery<Incident[]>("security.incidents.list", queryInput),
	});

	const { data: stats } = useQuery({
		queryKey: ["incidentStats", queryInput],
		queryFn: () =>
			trpcQuery<{
				total: number;
				open: number;
				critical: number;
				high: number;
				resolved: number;
			}>("security.incidents.stats", queryInput),
	});

	const { data: zones = [] } = useQuery({
		queryKey: ["zones"],
		queryFn: () => trpcQuery<Zone[]>("security.zones.list"),
	});

	const { data: employees = [] } = useQuery({
		queryKey: ["employees"],
		queryFn: () => trpcQuery<Employee[]>("users.list"),
	});

	const updateStatus = useMutation({
		mutationFn: (input: { id: string; status: string }) =>
			trpcMutate<Incident>("security.incidents.updateStatus", input),
		onSuccess: (updated) => {
			toast.success("Estado del incidente actualizado.");
			setSelected((current) =>
				current && current.id === updated.id
					? { ...current, status: updated.status }
					: current,
			);
			queryClient.invalidateQueries({ queryKey: ["incidents"] });
			queryClient.invalidateQueries({ queryKey: ["incidentStats"] });
		},
		onError: (error: Error) => toast.danger(error.message),
	});

	const hasFilters = Object.values(filters).some((value) => value !== "");

	return (
		<>
			<PageHeader
				title="Incidentes de seguridad"
				subtitle="Validaciones de acceso fuera de horario y alertas del sistema."
				actions={
					<>
						<Button
							onPress={() => refetch()}
							variant="secondary"
							size="sm"
							className="gap-2"
						>
							<RefreshCw
								size={15}
								className={isLoading ? "animate-spin" : ""}
							/>
							Actualizar
						</Button>
						<Button
							onPress={() => setShowManual(true)}
							variant="primary"
							size="sm"
							className="gap-1.5"
						>
							<Plus size={15} />
							Reportar
						</Button>
					</>
				}
			/>

			{/* ── Totales ── */}
			<Card variant="default" className="mb-5">
				<Card.Content className="grid grid-cols-2 gap-y-4 sm:grid-cols-5 sm:divide-x sm:divide-separator">
					<Readout label="Incidentes" value={stats?.total ?? 0} />
					<Readout label="Abiertos" value={stats?.open ?? 0} tone="pending" />
					<Readout label="Críticos" value={stats?.critical ?? 0} tone="deny" />
					<Readout
						label="Alta severidad"
						value={stats?.high ?? 0}
						tone="pending"
					/>
					<Readout
						label="Resueltos"
						value={stats?.resolved ?? 0}
						tone="grant"
					/>
				</Card.Content>
			</Card>

			{/* ── Filtros y exportación ── */}
			<Card variant="default" className="mb-5">
				<Card.Header>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Card.Title className="font-display text-base">
							Generador de reportes
						</Card.Title>
						<div className="flex flex-wrap items-center gap-2">
							{hasFilters && (
								<Button
									onPress={() => setFilters(EMPTY_FILTERS)}
									variant="tertiary"
									size="sm"
									className="gap-1.5"
								>
									<FilterX size={14} />
									Limpiar
								</Button>
							)}
							<a
								href={`/api/reports/incidents.pdf${exportQuery}`}
								className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-medium text-foreground text-xs transition-colors hover:bg-surface-secondary"
							>
								<FileText size={14} />
								PDF
							</a>
							<a
								href={`/api/reports/incidents.xlsx${exportQuery}`}
								className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-medium text-foreground text-xs transition-colors hover:bg-surface-secondary"
							>
								<FileSpreadsheet size={14} />
								Excel
							</a>
						</div>
					</div>
					<Card.Description>
						Filtra por rango de fechas, zona y usuario; la exportación respeta
						exactamente los criterios aplicados.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<DateField
							label="Desde"
							value={filters.from}
							onChange={(value) => setFilters((f) => ({ ...f, from: value }))}
						/>
						<DateField
							label="Hasta"
							value={filters.to}
							onChange={(value) => setFilters((f) => ({ ...f, to: value }))}
						/>
						<PickerField
							label="Zona / Área"
							value={filters.zoneId}
							onChange={(value) => setFilters((f) => ({ ...f, zoneId: value }))}
							options={zones.map((zone) => ({
								id: zone.id,
								label: `${zone.name} (${zone.code})`,
							}))}
							placeholder="Todas las zonas"
						/>
						<PickerField
							label="Usuario"
							value={filters.userId}
							onChange={(value) => setFilters((f) => ({ ...f, userId: value }))}
							options={employees.map((employee) => ({
								id: employee.id,
								label: employee.name,
							}))}
							placeholder="Todo el personal"
						/>
						<PickerField
							label="Tipo"
							value={filters.type}
							onChange={(value) => setFilters((f) => ({ ...f, type: value }))}
							options={Object.entries(TYPE_LABELS).map(([id, label]) => ({
								id,
								label,
							}))}
						/>
						<PickerField
							label="Severidad"
							value={filters.severity}
							onChange={(value) =>
								setFilters((f) => ({ ...f, severity: value }))
							}
							options={Object.entries(SEVERITY_LABELS).map(([id, label]) => ({
								id,
								label,
							}))}
						/>
						<PickerField
							label="Estado"
							value={filters.status}
							onChange={(value) => setFilters((f) => ({ ...f, status: value }))}
							options={Object.entries(STATUS_LABELS).map(([id, label]) => ({
								id,
								label,
							}))}
						/>
						<label className="flex flex-col">
							<span className="telemetry mb-1.5">Búsqueda</span>
							<input
								type="search"
								value={filters.search}
								placeholder="Texto en título o descripción"
								onChange={(event) =>
									setFilters((f) => ({ ...f, search: event.target.value }))
								}
								className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 text-field-foreground text-sm outline-none placeholder:text-field-placeholder focus:border-focus"
							/>
						</label>
					</div>
				</Card.Content>
			</Card>

			{/* ── Tabla ── */}
			<Card variant="default">
				<Card.Header>
					<Card.Title className="font-display text-base">
						Registro de incidentes
					</Card.Title>
				</Card.Header>
				<Card.Content className="p-0">
					{isLoading && incidents.length === 0 ? (
						<LoadingRow />
					) : incidents.length === 0 ? (
						<EmptyState
							icon={<ShieldCheck size={22} className="text-success" />}
							title="Sin incidentes"
							body={
								hasFilters
									? "Ningún incidente coincide con los criterios seleccionados."
									: "No se han registrado accesos fuera de horario ni alertas de seguridad."
							}
						/>
					) : (
						<Table variant="secondary">
							<Table.ScrollContainer>
								<Table.Content
									aria-label="Registro de incidentes"
									className="min-w-[940px]"
								>
									<Table.Header>
										<Table.Column isRowHeader>Fecha</Table.Column>
										<Table.Column>Hora</Table.Column>
										<Table.Column>Tipo</Table.Column>
										<Table.Column>Zona / Área</Table.Column>
										<Table.Column>Usuario</Table.Column>
										<Table.Column>Severidad</Table.Column>
										<Table.Column>Estado</Table.Column>
										<Table.Column className="text-right">Detalle</Table.Column>
									</Table.Header>
									<Table.Body>
										{incidents.map((incident) => (
											<Table.Row key={incident.id} id={incident.id}>
												<Table.Cell className="readout py-3 text-[11px] text-muted">
													{formatDateOnly(incident.occurredAt)}
												</Table.Cell>
												<Table.Cell className="readout py-3 text-[11px] text-foreground">
													{formatTimeOnly(incident.occurredAt)}
												</Table.Cell>
												<Table.Cell className="py-3 text-foreground text-sm">
													{TYPE_LABELS[incident.type] ?? incident.type}
												</Table.Cell>
												<Table.Cell className="py-3 text-muted text-sm">
													{incident.zoneName ?? "—"}
												</Table.Cell>
												<Table.Cell className="py-3 text-muted text-sm">
													{incident.userName ?? "No identificado"}
												</Table.Cell>
												<Table.Cell className="py-3">
													<Chip
														color={
															SEVERITY_COLOR[incident.severity] ?? "default"
														}
														variant="soft"
														size="sm"
													>
														<Chip.Label>
															{SEVERITY_LABELS[incident.severity] ??
																incident.severity}
														</Chip.Label>
													</Chip>
												</Table.Cell>
												<Table.Cell className="py-3">
													<Chip
														color={STATUS_COLOR[incident.status] ?? "default"}
														variant="soft"
														size="sm"
													>
														<Chip.Label>
															{STATUS_LABELS[incident.status] ??
																incident.status}
														</Chip.Label>
													</Chip>
												</Table.Cell>
												<Table.Cell className="py-3 text-right">
													<Button
														onPress={() => setSelected(incident)}
														variant="secondary"
														size="sm"
													>
														Ver
													</Button>
												</Table.Cell>
											</Table.Row>
										))}
									</Table.Body>
								</Table.Content>
							</Table.ScrollContainer>
						</Table>
					)}
				</Card.Content>
			</Card>

			<IncidentDetailModal
				incident={selected}
				onClose={() => setSelected(null)}
				onChangeStatus={(status) => {
					if (selected) updateStatus.mutate({ id: selected.id, status });
				}}
				isUpdating={updateStatus.isPending}
			/>

			<ManualReportModal
				isOpen={showManual}
				onClose={() => setShowManual(false)}
				zones={zones}
				employees={employees}
			/>
		</>
	);
}

/* ── Detalle ─────────────────────────────────────────────────────────────── */

function IncidentDetailModal({
	incident,
	onClose,
	onChangeStatus,
	isUpdating,
}: {
	incident: Incident | null;
	onClose: () => void;
	onChangeStatus: (status: string) => void;
	isUpdating: boolean;
}) {
	return (
		<Modal
			isOpen={incident !== null}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<Modal.Backdrop variant="blur">
				<Modal.Container size="md" placement="center" className="text-left">
					<Modal.Dialog>
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="font-display font-semibold text-base">
								{incident?.title ?? "Incidente"}
							</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="pt-2">
							{incident && (
								<>
									<div className="mb-4 flex flex-wrap gap-2">
										<Chip
											color={SEVERITY_COLOR[incident.severity] ?? "default"}
											variant="soft"
											size="sm"
										>
											<Chip.Label>
												{SEVERITY_LABELS[incident.severity] ??
													incident.severity}
											</Chip.Label>
										</Chip>
										<Chip
											color={STATUS_COLOR[incident.status] ?? "default"}
											variant="soft"
											size="sm"
										>
											<Chip.Label>
												{STATUS_LABELS[incident.status] ?? incident.status}
											</Chip.Label>
										</Chip>
										<Chip color="default" variant="soft" size="sm">
											<Chip.Label>
												{TYPE_LABELS[incident.type] ?? incident.type}
											</Chip.Label>
										</Chip>
									</div>

									<p className="telemetry mb-1">Explicación del incidente</p>
									<p className="mb-4 text-foreground text-sm leading-relaxed">
										{incident.description}
									</p>

									<dl className="grid grid-cols-2 gap-x-4 gap-y-3">
										<Item
											label="Fecha"
											value={formatDateOnly(incident.occurredAt)}
										/>
										<Item
											label="Hora"
											value={formatTimeOnly(incident.occurredAt)}
										/>
										<Item
											label="Zona / Área"
											value={
												incident.zoneName
													? `${incident.zoneName}${incident.zoneCode ? ` (${incident.zoneCode})` : ""}`
													: "—"
											}
										/>
										<Item
											label="Usuario"
											value={incident.userName ?? "No identificado"}
										/>
										<Item label="Correo" value={incident.userEmail ?? "—"} />
										<Item label="Origen" value={incident.source} />
										<Item label="IP" value={incident.ipAddress ?? "—"} />
										<Item
											label="Detectado"
											value={formatDateTime(incident.detectedAt)}
										/>
									</dl>

									{incident.resolutionNotes && (
										<>
											<Separator className="my-4" />
											<p className="telemetry mb-1">Notas de resolución</p>
											<p className="text-foreground text-sm">
												{incident.resolutionNotes}
											</p>
										</>
									)}
								</>
							)}
						</Modal.Body>
						<Modal.Footer className="mt-5 flex flex-wrap justify-end gap-2">
							<Button
								onPress={() => onChangeStatus("acknowledged")}
								variant="secondary"
								size="sm"
								isPending={isUpdating}
							>
								En revisión
							</Button>
							<Button
								onPress={() => onChangeStatus("dismissed")}
								variant="secondary"
								size="sm"
								isPending={isUpdating}
							>
								Descartar
							</Button>
							<Button
								onPress={() => onChangeStatus("resolved")}
								variant="primary"
								size="sm"
								isPending={isUpdating}
							>
								Marcar resuelto
							</Button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}

function Item({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="telemetry">{label}</dt>
			<dd className="mt-1 break-words text-foreground text-sm">{value}</dd>
		</div>
	);
}

/* ── Reporte manual ──────────────────────────────────────────────────────── */

function ManualReportModal({
	isOpen,
	onClose,
	zones,
	employees,
}: {
	isOpen: boolean;
	onClose: () => void;
	zones: Zone[];
	employees: Employee[];
}) {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [occurredAt, setOccurredAt] = useState("");
	const [severity, setSeverity] = useState("medium");
	const [zoneId, setZoneId] = useState("");
	const [userId, setUserId] = useState("");
	const [error, setError] = useState<string | null>(null);

	const create = useMutation({
		mutationFn: (input: Record<string, unknown>) =>
			trpcMutate<Incident>("security.incidents.create", input),
		onSuccess: () => {
			toast.success("Incidente registrado.");
			setTitle("");
			setDescription("");
			setOccurredAt("");
			setSeverity("medium");
			setZoneId("");
			setUserId("");
			setError(null);
			queryClient.invalidateQueries({ queryKey: ["incidents"] });
			queryClient.invalidateQueries({ queryKey: ["incidentStats"] });
			onClose();
		},
		onError: (mutationError: Error) => {
			setError(mutationError.message);
			toast.danger(mutationError.message);
		},
	});

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		if (title.trim().length < 3 || description.trim().length < 10) {
			setError("El título requiere al menos 3 caracteres y la explicación 10.");
			return;
		}
		create.mutate({
			title: title.trim(),
			description: description.trim(),
			occurredAt: occurredAt
				? new Date(occurredAt).toISOString()
				: new Date().toISOString(),
			type: "manual_report",
			severity,
			zoneId: zoneId || null,
			userId: userId || null,
		});
	}

	return (
		<Modal
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Modal.Backdrop variant="blur">
				<Modal.Container size="md" placement="center" className="text-left">
					<Modal.Dialog>
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="font-display font-semibold text-base">
								Reportar incidente
							</Modal.Heading>
						</Modal.Header>
						<form onSubmit={handleSubmit}>
							<Modal.Body className="flex flex-col gap-4 pt-2">
								<TextField
									name="title"
									value={title}
									onChange={setTitle}
									isRequired
								>
									<Label className="telemetry mb-1.5 block">Título</Label>
									<Input
										variant="secondary"
										placeholder="Acceso no autorizado en almacén"
									/>
								</TextField>

								<label className="flex flex-col">
									<span className="telemetry mb-1.5">
										Explicación del incidente
									</span>
									<textarea
										value={description}
										onChange={(event) => setDescription(event.target.value)}
										rows={4}
										placeholder="Describe qué ocurrió, quién intervino y qué medidas se tomaron."
										className="rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 py-2 text-field-foreground text-sm outline-none placeholder:text-field-placeholder focus:border-focus"
									/>
								</label>

								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<label className="flex flex-col">
										<span className="telemetry mb-1.5">Fecha y hora</span>
										<input
											type="datetime-local"
											value={occurredAt}
											onChange={(event) => setOccurredAt(event.target.value)}
											className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 text-field-foreground text-sm outline-none focus:border-focus"
										/>
									</label>
									<PickerField
										label="Severidad"
										value={severity}
										onChange={setSeverity}
										options={Object.entries(SEVERITY_LABELS).map(
											([id, label]) => ({ id, label }),
										)}
										placeholder="Media"
									/>
									<PickerField
										label="Zona / Área"
										value={zoneId}
										onChange={setZoneId}
										options={zones.map((zone) => ({
											id: zone.id,
											label: `${zone.name} (${zone.code})`,
										}))}
										placeholder="Sin zona"
									/>
									<PickerField
										label="Usuario involucrado"
										value={userId}
										onChange={setUserId}
										options={employees.map((employee) => ({
											id: employee.id,
											label: employee.name,
										}))}
										placeholder="Sin usuario"
									/>
								</div>

								{error && (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>No se pudo registrar</Alert.Title>
											<Alert.Description>{error}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}
							</Modal.Body>
							<Modal.Footer className="mt-6 flex justify-end gap-3">
								<Button type="button" variant="secondary" onPress={onClose}>
									Cancelar
								</Button>
								<Button
									type="submit"
									variant="primary"
									isPending={create.isPending}
									className="font-semibold"
								>
									Registrar
								</Button>
							</Modal.Footer>
						</form>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
