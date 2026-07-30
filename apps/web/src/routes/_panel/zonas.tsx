import {
	Alert,
	Button,
	Card,
	Chip,
	Input,
	Label,
	Modal,
	Table,
	TextField,
	toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DoorOpen, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "#/components/app-shell";
import { EmptyState, LoadingRow } from "#/components/panel-bits";
import { normalizeRole } from "#/lib/navigation";
import { trpcMutate, trpcQuery } from "#/lib/trpc";
import { authClient } from "#/utils/auth-client";

export const Route = createFileRoute("/_panel/zonas")({ component: ZonasPage });

const WEEKDAYS = [
	{ index: 1, short: "Lun" },
	{ index: 2, short: "Mar" },
	{ index: 3, short: "Mié" },
	{ index: 4, short: "Jue" },
	{ index: 5, short: "Vie" },
	{ index: 6, short: "Sáb" },
	{ index: 0, short: "Dom" },
];

const RISK_LABELS: Record<string, string> = {
	low: "Bajo",
	medium: "Medio",
	high: "Alto",
	critical: "Crítico",
};

const RISK_COLOR: Record<
	string,
	"default" | "accent" | "success" | "warning" | "danger"
> = {
	low: "success",
	medium: "warning",
	high: "warning",
	critical: "danger",
};

type Zone = {
	id: string;
	code: string;
	name: string;
	description: string | null;
	riskLevel: string;
	restricted: boolean;
	allowedFromMinute: number;
	allowedToMinute: number;
	allowedDays: number[];
	timezone: string;
	active: boolean;
};

/** `510` ⇄ `"08:30"` — el horario viaja en minutos desde medianoche. */
function minutesToTime(minutes: number) {
	const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
	return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
		safe % 60,
	).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
	const [hours, mins] = value
		.split(":")
		.map((part) => Number.parseInt(part, 10));
	if (Number.isNaN(hours) || Number.isNaN(mins)) return 0;
	return Math.min(1439, Math.max(0, hours * 60 + mins));
}

type ZoneForm = {
	id?: string;
	code: string;
	name: string;
	description: string;
	riskLevel: string;
	restricted: boolean;
	from: string;
	to: string;
	allowedDays: number[];
	timezone: string;
	active: boolean;
};

const BLANK_FORM: ZoneForm = {
	code: "",
	name: "",
	description: "",
	riskLevel: "medium",
	restricted: true,
	from: "08:00",
	to: "18:00",
	allowedDays: [1, 2, 3, 4, 5],
	timezone: "America/Caracas",
	active: true,
};

function zoneToForm(zone: Zone): ZoneForm {
	return {
		id: zone.id,
		code: zone.code,
		name: zone.name,
		description: zone.description ?? "",
		riskLevel: zone.riskLevel,
		restricted: zone.restricted,
		from: minutesToTime(zone.allowedFromMinute),
		to: minutesToTime(zone.allowedToMinute),
		allowedDays: zone.allowedDays ?? [],
		timezone: zone.timezone,
		active: zone.active,
	};
}

function ZonasPage() {
	const queryClient = useQueryClient();
	const { data: sessionData } = authClient.useSession();
	const isAdmin =
		normalizeRole(
			(sessionData?.user as { role?: string } | undefined)?.role,
		) === "admin";

	const [form, setForm] = useState<ZoneForm | null>(null);
	const [zoneToDelete, setZoneToDelete] = useState<Zone | null>(null);
	const [error, setError] = useState<string | null>(null);

	const { data: zones = [], isLoading } = useQuery({
		queryKey: ["zones"],
		queryFn: () => trpcQuery<Zone[]>("security.zones.list"),
	});

	function invalidate() {
		queryClient.invalidateQueries({ queryKey: ["zones"] });
	}

	const saveZone = useMutation({
		mutationFn: (input: ZoneForm) => {
			const payload = {
				code: input.code.trim(),
				name: input.name.trim(),
				description: input.description.trim() || null,
				riskLevel: input.riskLevel,
				restricted: input.restricted,
				allowedFromMinute: timeToMinutes(input.from),
				allowedToMinute: timeToMinutes(input.to),
				allowedDays: input.allowedDays,
				timezone: input.timezone.trim(),
				active: input.active,
			};
			return input.id
				? trpcMutate<Zone>("security.zones.update", {
						id: input.id,
						...payload,
					})
				: trpcMutate<Zone>("security.zones.create", payload);
		},
		onSuccess: () => {
			toast.success("Zona guardada.");
			setForm(null);
			setError(null);
			invalidate();
		},
		onError: (mutationError: Error) => {
			setError(mutationError.message);
			toast.danger(mutationError.message);
		},
	});

	const deleteZone = useMutation({
		mutationFn: (id: string) =>
			trpcMutate<{ success: boolean }>("security.zones.remove", { id }),
		onSuccess: () => {
			toast.success("Zona eliminada.");
			invalidate();
		},
		onError: (mutationError: Error) => toast.danger(mutationError.message),
	});

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (!form) return;
		setError(null);
		if (form.code.trim().length < 2 || form.name.trim().length < 2) {
			setError("El código y el nombre requieren al menos 2 caracteres.");
			return;
		}
		if (form.restricted && form.allowedDays.length === 0) {
			setError(
				"Selecciona al menos un día habilitado para una zona restringida.",
			);
			return;
		}
		saveZone.mutate(form);
	}

	return (
		<>
			<PageHeader
				title="Zonas y horarios"
				subtitle="Puntos de acceso controlados y sus turnos permitidos."
				actions={
					isAdmin && (
						<Button
							onPress={() => {
								setError(null);
								setForm(BLANK_FORM);
							}}
							variant="primary"
							size="sm"
							className="gap-1.5"
						>
							<Plus size={15} />
							Nueva zona
						</Button>
					)
				}
			/>

			<Card variant="default">
				<Card.Header>
					<Card.Title className="font-display text-base">
						Zonas registradas
					</Card.Title>
					<Card.Description>
						Un acceso fuera de la ventana horaria de una zona restringida genera
						automáticamente un incidente de seguridad.
					</Card.Description>
				</Card.Header>
				<Card.Content className="p-0">
					{isLoading && zones.length === 0 ? (
						<LoadingRow />
					) : zones.length === 0 ? (
						<EmptyState
							icon={<DoorOpen size={22} className="text-muted" />}
							title="Sin zonas configuradas"
							body={
								isAdmin
									? "Crea la primera zona para empezar a validar accesos por horario."
									: "Un administrador debe configurar las zonas de acceso."
							}
						/>
					) : (
						<Table variant="secondary">
							<Table.ScrollContainer>
								<Table.Content
									aria-label="Zonas registradas"
									className="min-w-[820px]"
								>
									<Table.Header>
										<Table.Column isRowHeader>Zona</Table.Column>
										<Table.Column>Horario permitido</Table.Column>
										<Table.Column>Días</Table.Column>
										<Table.Column>Riesgo</Table.Column>
										<Table.Column>Estado</Table.Column>
										{isAdmin && (
											<Table.Column className="text-right">
												Acciones
											</Table.Column>
										)}
									</Table.Header>
									<Table.Body>
										{zones.map((zone) => (
											<Table.Row key={zone.id} id={zone.id}>
												<Table.Cell className="py-3">
													<div className="flex flex-col">
														<span className="font-medium text-foreground">
															{zone.name}
														</span>
														<span className="readout text-[11px] text-muted">
															{zone.code} · {zone.timezone}
														</span>
													</div>
												</Table.Cell>
												<Table.Cell className="readout py-3 text-[11px] text-foreground">
													{zone.restricted
														? `${minutesToTime(zone.allowedFromMinute)}–${minutesToTime(zone.allowedToMinute)}`
														: "Libre tránsito"}
												</Table.Cell>
												<Table.Cell className="py-3">
													<div className="flex flex-wrap gap-1">
														{WEEKDAYS.map((day) => (
															<span
																key={day.index}
																className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
																	zone.allowedDays?.includes(day.index)
																		? "bg-accent-soft text-accent-soft-foreground"
																		: "text-muted"
																}`}
															>
																{day.short}
															</span>
														))}
													</div>
												</Table.Cell>
												<Table.Cell className="py-3">
													<Chip
														color={RISK_COLOR[zone.riskLevel] ?? "default"}
														variant="soft"
														size="sm"
													>
														<Chip.Label>
															{RISK_LABELS[zone.riskLevel] ?? zone.riskLevel}
														</Chip.Label>
													</Chip>
												</Table.Cell>
												<Table.Cell className="py-3">
													<Chip
														color={zone.active ? "success" : "default"}
														variant="soft"
														size="sm"
													>
														<Chip.Label>
															{zone.active ? "Activa" : "Fuera de servicio"}
														</Chip.Label>
													</Chip>
												</Table.Cell>
												{isAdmin && (
													<Table.Cell className="py-3 text-right">
														<div className="flex justify-end gap-2">
															<Button
																onPress={() => {
																	setError(null);
																	setForm(zoneToForm(zone));
																}}
																variant="secondary"
																size="sm"
																isIconOnly
																aria-label={`Editar ${zone.name}`}
															>
																<Pencil size={14} />
															</Button>
															<Button
																onPress={() => setZoneToDelete(zone)}
																variant="danger"
																size="sm"
																isIconOnly
																aria-label={`Eliminar ${zone.name}`}
															>
																<Trash2 size={14} />
															</Button>
														</div>
													</Table.Cell>
												)}
											</Table.Row>
										))}
									</Table.Body>
								</Table.Content>
							</Table.ScrollContainer>
						</Table>
					)}
				</Card.Content>
			</Card>

			{/* ── Alta / edición ── */}
			<Modal
				isOpen={form !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) setForm(null);
				}}
			>
				<Modal.Backdrop variant="blur">
					<Modal.Container size="md" placement="center" className="text-left">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading className="font-display font-semibold text-base">
									{form?.id ? "Editar zona" : "Nueva zona"}
								</Modal.Heading>
							</Modal.Header>
							{form && (
								<form onSubmit={handleSubmit}>
									<Modal.Body className="flex flex-col gap-4 pt-2">
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											<TextField
												name="code"
												value={form.code}
												onChange={(value) => setForm({ ...form, code: value })}
												isRequired
											>
												<Label className="telemetry mb-1.5 block">Código</Label>
												<Input variant="secondary" placeholder="SRV-01" />
											</TextField>
											<TextField
												name="name"
												value={form.name}
												onChange={(value) => setForm({ ...form, name: value })}
												isRequired
											>
												<Label className="telemetry mb-1.5 block">Nombre</Label>
												<Input
													variant="secondary"
													placeholder="Sala de servidores"
												/>
											</TextField>
										</div>

										<label className="flex flex-col">
											<span className="telemetry mb-1.5">Descripción</span>
											<textarea
												value={form.description}
												onChange={(event) =>
													setForm({ ...form, description: event.target.value })
												}
												rows={2}
												placeholder="Área con equipos críticos de red."
												className="rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 py-2 text-field-foreground text-sm outline-none placeholder:text-field-placeholder focus:border-focus"
											/>
										</label>

										<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
											<label className="flex flex-col">
												<span className="telemetry mb-1.5">Desde</span>
												<input
													type="time"
													value={form.from}
													onChange={(event) =>
														setForm({ ...form, from: event.target.value })
													}
													className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 text-field-foreground text-sm outline-none focus:border-focus"
												/>
											</label>
											<label className="flex flex-col">
												<span className="telemetry mb-1.5">Hasta</span>
												<input
													type="time"
													value={form.to}
													onChange={(event) =>
														setForm({ ...form, to: event.target.value })
													}
													className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2.5 text-field-foreground text-sm outline-none focus:border-focus"
												/>
											</label>
											<label className="flex flex-col">
												<span className="telemetry mb-1.5">Riesgo</span>
												<select
													value={form.riskLevel}
													onChange={(event) =>
														setForm({ ...form, riskLevel: event.target.value })
													}
													className="h-9 rounded-[var(--field-radius)] border border-field-border bg-field px-2 text-field-foreground text-sm outline-none focus:border-focus"
												>
													{Object.entries(RISK_LABELS).map(
														([id, riskLabel]) => (
															<option key={id} value={id}>
																{riskLabel}
															</option>
														),
													)}
												</select>
											</label>
										</div>

										<div>
											<span className="telemetry mb-1.5 block">
												Días habilitados
											</span>
											<div className="flex flex-wrap gap-1.5">
												{WEEKDAYS.map((day) => {
													const enabled = form.allowedDays.includes(day.index);
													return (
														<button
															key={day.index}
															type="button"
															aria-pressed={enabled}
															onClick={() =>
																setForm({
																	...form,
																	allowedDays: enabled
																		? form.allowedDays.filter(
																				(value) => value !== day.index,
																			)
																		: [...form.allowedDays, day.index],
																})
															}
															className={`rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase transition-colors ${
																enabled
																	? "border-accent bg-accent-soft text-accent-soft-foreground"
																	: "border-border text-muted hover:bg-surface-secondary"
															}`}
														>
															{day.short}
														</button>
													);
												})}
											</div>
										</div>

										<TextField
											name="timezone"
											value={form.timezone}
											onChange={(value) =>
												setForm({ ...form, timezone: value })
											}
											isRequired
										>
											<Label className="telemetry mb-1.5 block">
												Huso horario
											</Label>
											<Input
												variant="secondary"
												placeholder="America/Caracas"
											/>
										</TextField>

										<div className="flex flex-wrap gap-4">
											<ToggleRow
												label="Zona restringida"
												hint="Valida el horario y levanta incidentes."
												checked={form.restricted}
												onChange={(checked) =>
													setForm({ ...form, restricted: checked })
												}
											/>
											<ToggleRow
												label="Zona activa"
												hint="Desactívala si está fuera de servicio."
												checked={form.active}
												onChange={(checked) =>
													setForm({ ...form, active: checked })
												}
											/>
										</div>

										{error && (
											<Alert status="danger">
												<Alert.Indicator />
												<Alert.Content>
													<Alert.Title>No se pudo guardar</Alert.Title>
													<Alert.Description>{error}</Alert.Description>
												</Alert.Content>
											</Alert>
										)}
									</Modal.Body>
									<Modal.Footer className="mt-6 flex justify-end gap-3">
										<Button
											type="button"
											variant="secondary"
											onPress={() => setForm(null)}
										>
											Cancelar
										</Button>
										<Button
											type="submit"
											variant="primary"
											isPending={saveZone.isPending}
											className="font-semibold"
										>
											Guardar
										</Button>
									</Modal.Footer>
								</form>
							)}
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>

			{/* ── Confirmación de borrado ── */}
			<Modal
				isOpen={zoneToDelete !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) setZoneToDelete(null);
				}}
			>
				<Modal.Backdrop variant="blur">
					<Modal.Container size="sm" placement="center" className="text-left">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading className="flex items-center gap-2 font-display font-semibold text-base">
									<TriangleAlert className="text-warning" size={18} />
									Eliminar zona
								</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="pt-2">
								<p className="text-foreground text-sm">
									¿Eliminar la zona <strong>{zoneToDelete?.name}</strong>?
								</p>
								<p className="mt-2 text-muted text-sm">
									Los incidentes históricos se conservan y seguirán mostrando el
									nombre de la zona al momento del hecho.
								</p>
							</Modal.Body>
							<Modal.Footer className="mt-6 flex justify-end gap-3">
								<Button
									onPress={() => setZoneToDelete(null)}
									variant="secondary"
								>
									Cancelar
								</Button>
								<Button
									onPress={() => {
										if (zoneToDelete) {
											deleteZone.mutate(zoneToDelete.id);
											setZoneToDelete(null);
										}
									}}
									variant="danger"
									className="font-semibold"
								>
									Eliminar
								</Button>
							</Modal.Footer>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
		</>
	);
}

function ToggleRow({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex flex-1 cursor-pointer items-start gap-2.5">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="mt-0.5 size-4 accent-[var(--accent)]"
			/>
			<span className="min-w-0">
				<span className="block font-medium text-foreground text-sm">
					{label}
				</span>
				<span className="block text-[11px] text-muted">{hint}</span>
			</span>
		</label>
	);
}
