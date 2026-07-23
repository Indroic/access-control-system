import {
	Alert,
	Avatar,
	Button,
	Card,
	Chip,
	Input,
	Label,
	ListBox,
	Meter,
	Modal,
	Select,
	Separator,
	Table,
	Tabs,
	TextField,
	toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	Bell,
	BellOff,
	Camera,
	LogOut,
	RefreshCw,
	Trash2,
	TriangleAlert,
	UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FaceEnrollment } from "#/components/face-enrollment";
import { Brandmark, TelemetryRow, ThermalLegend } from "#/components/hud";
import { usePushNotifications } from "#/hooks/use-push-notifications";
import { authClient } from "#/utils/auth-client";

export const Route = createFileRoute("/admin")({ component: AdminConsole });

type EmployeeRole = "user" | "jefe" | "gerente" | "admin";

const ROLE_OPTIONS: { id: EmployeeRole; label: string }[] = [
	{ id: "user", label: "Empleado" },
	{ id: "jefe", label: "Jefe" },
	{ id: "gerente", label: "Gerente" },
	{ id: "admin", label: "Administrador" },
];

const ROLE_LABEL: Record<string, string> = {
	user: "Empleado",
	jefe: "Jefe",
	gerente: "Gerente",
	admin: "Administrador",
};

type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

function actionTag(action: string): { color: ChipColor; label: string } {
	switch (action) {
		case "biometric_match_success":
			return { color: "success", label: "Coincidencia" };
		case "biometric_match_failed":
			return { color: "danger", label: "Sin coincidencia" };
		case "biometrics_registered":
			return { color: "accent", label: "Enrolado" };
		case "door_opened":
			return { color: "success", label: "Puerta abierta" };
		case "door_open_failed":
			return { color: "warning", label: "Apertura fallida" };
		default:
			return { color: "default", label: action };
	}
}

function initials(name?: string) {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("");
}

function AdminConsole() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [userToDelete, setUserToDelete] = useState<any | null>(null);
	const [activeTab, setActiveTab] = useState<"employees" | "audit">(
		"employees",
	);

	const [regName, setRegName] = useState("");
	const [regEmail, setRegEmail] = useState("");
	const [regPassword, setRegPassword] = useState("");
	const [regRole, setRegRole] = useState<EmployeeRole>("user");
	const [regSuccess, setRegSuccess] = useState<string | null>(null);
	const [regError, setRegError] = useState<string | null>(null);

	const [selectedUserForFace, setSelectedUserForFace] = useState<any | null>(
		null,
	);

	const {
		data: sessionData,
		isPending: sessionLoading,
		error: sessionError,
	} = authClient.useSession();

	const push = usePushNotifications();
	const ALERT_ROLES = ["admin", "gerente", "jefe"];
	const canReceiveAlerts = ALERT_ROLES.includes(
		(sessionData as any)?.user?.role ?? "",
	);

	async function handleTogglePush() {
		try {
			if (push.isSubscribed) {
				await push.unsubscribe();
				toast.success("Alertas de seguridad desactivadas.");
			} else {
				await push.subscribe();
				toast.success("Alertas de seguridad activadas.");
			}
		} catch (err: any) {
			toast.danger(err.message || "No se pudieron actualizar las alertas.");
		}
	}

	useEffect(() => {
		if (!sessionLoading && (sessionError || !sessionData)) {
			navigate({ to: "/" });
		}
	}, [sessionError, sessionData, sessionLoading, navigate]);

	async function handleLogout() {
		await authClient.signOut();
		navigate({ to: "/" });
	}

	const {
		data: employees = [],
		isLoading: employeesLoading,
		refetch: refetchEmployees,
	} = useQuery({
		queryKey: ["employees"],
		queryFn: async () => {
			const res = await fetch("/api/trpc/users.list");
			if (!res.ok) throw new Error("Failed to fetch employees");
			const data = await res.json();
			return data.result.data || [];
		},
		enabled: !!sessionData,
	});

	const {
		data: auditLogs = [],
		isLoading: auditLoading,
		refetch: refetchAuditLogs,
	} = useQuery({
		queryKey: ["auditLogs"],
		queryFn: async () => {
			const res = await fetch("/api/trpc/audit.list");
			if (!res.ok) throw new Error("Failed to fetch audit logs");
			const data = await res.json();
			return data.result.data || [];
		},
		enabled: !!sessionData,
	});

	const loading = employeesLoading || auditLoading;

	useEffect(() => {
		if (!sessionData) return;
		const eventSource = new EventSource("/api/sse/live-updates");
		eventSource.onmessage = (event) => {
			if (event.data === "update" || event.data === "sync") {
				queryClient.invalidateQueries({ queryKey: ["employees"] });
				queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
			}
		};
		eventSource.onerror = (err) => {
			console.warn("Conexión SSE interrumpida. Reconectando…", err);
		};
		return () => eventSource.close();
	}, [sessionData, queryClient]);

	const createEmployeeMutation = useMutation({
		mutationFn: async (newEmp: {
			name: string;
			email: string;
			password: string;
			role: EmployeeRole;
		}) => {
			const { data, error } = await authClient.admin.createUser({
				name: newEmp.name,
				email: newEmp.email,
				password: newEmp.password,
				role: newEmp.role,
			});
			if (error)
				throw new Error(error.message || "Error al registrar al empleado.");
			return data;
		},
		onSuccess: (data) => {
			const successMsg = `${regName} registrado. Ya puedes capturar su rostro.`;
			setRegSuccess(successMsg);
			toast.success(successMsg);
			setRegName("");
			setRegEmail("");
			setRegPassword("");
			setRegRole("user");
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			setSelectedUserForFace(data?.user);
		},
		onError: (err: any) => {
			const errMsg = err.message || "Fallo técnico al registrar empleado.";
			setRegError(errMsg);
			toast.danger(errMsg);
		},
	});

	async function handleCreateEmployee(e: React.FormEvent) {
		e.preventDefault();
		setRegSuccess(null);
		setRegError(null);
		if (!regName || !regEmail || !regPassword) {
			const errMsg = "Todos los campos son obligatorios.";
			setRegError(errMsg);
			toast.danger(errMsg);
			return;
		}
		createEmployeeMutation.mutate({
			name: regName,
			email: regEmail,
			password: regPassword,
			role: regRole,
		});
	}

	const deleteEmployeeMutation = useMutation({
		mutationFn: async (userId: string) => {
			const res = await fetch("/api/trpc/users.delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId }),
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.error || "Error al eliminar al empleado.");
			}
			return res.json();
		},
		onSuccess: () => {
			toast.success("Empleado eliminado.");
			queryClient.invalidateQueries({ queryKey: ["employees"] });
		},
		onError: (err: any) => {
			console.error("Error al eliminar empleado:", err);
			toast.danger(err.message || "Fallo técnico al eliminar empleado.");
		},
	});

	function closeFaceRegistration() {
		setSelectedUserForFace(null);
	}

	function handleFaceRegistrationSuccess() {
		refetchEmployees();
		refetchAuditLogs();
		toast.success("Biometría registrada correctamente.");
	}

	const total = auditLogs.length;
	const enrolledCount = employees.filter((e: any) => e.faceRegistered).length;
	const grantedCount = auditLogs.filter(
		(l: any) =>
			l.action === "biometric_match_success" || l.action === "door_opened",
	).length;
	const failedCount = auditLogs.filter(
		(l: any) =>
			l.action === "biometric_match_failed" || l.action === "door_open_failed",
	).length;
	const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

	if (sessionLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted">
				<RefreshCw className="animate-spin" size={28} />
			</div>
		);
	}

	return (
		<main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6">
			<header className="flex flex-wrap items-center justify-between gap-4 pb-5">
				<Brandmark sub="Consola de control · en vivo" />
				<div className="flex flex-wrap items-center gap-2">
					{canReceiveAlerts && push.isSupported && (
						<Button
							onPress={handleTogglePush}
							variant="secondary"
							size="sm"
							className="gap-2"
						>
							{push.isSubscribed ? <BellOff size={15} /> : <Bell size={15} />}
							{push.isSubscribed ? "Silenciar" : "Alertas"}
						</Button>
					)}
					<Button
						onPress={() => {
							refetchEmployees();
							refetchAuditLogs();
						}}
						variant="secondary"
						size="sm"
						className="gap-2"
					>
						<RefreshCw size={15} className={loading ? "animate-spin" : ""} />
						Actualizar
					</Button>
					<Button
						onPress={handleLogout}
						variant="danger"
						size="sm"
						className="gap-2"
					>
						<LogOut size={15} />
						Salir
					</Button>
				</div>
			</header>

			<ThermalLegend className="mb-6 w-full" />

			<Tabs
				selectedKey={activeTab}
				onSelectionChange={(key) => setActiveTab(key as "employees" | "audit")}
				variant="secondary"
			>
				<Tabs.ListContainer>
					<Tabs.List aria-label="Vistas de la consola">
						<Tabs.Tab id="employees">
							<span className="font-medium">Personal</span>
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id="audit">
							<span className="font-medium">Bitácora</span>
							<Tabs.Indicator />
						</Tabs.Tab>
					</Tabs.List>
				</Tabs.ListContainer>

				{/* ── Personal ── */}
				<Tabs.Panel id="employees" className="pt-6">
					{loading && employees.length === 0 ? (
						<LoadingRow />
					) : (
						<div className="grid gap-6 lg:grid-cols-3">
							<div className="lg:col-span-1">
								<Card variant="default" className="lg:sticky lg:top-6">
									<Card.Header>
										<Card.Title className="flex items-center gap-2 font-display text-base">
											<UserPlus size={18} className="text-accent" />
											Alta de personal
										</Card.Title>
										<Card.Description>
											Registra al empleado y luego captura su biometría.
										</Card.Description>
									</Card.Header>
									<form onSubmit={handleCreateEmployee}>
										<Card.Content className="flex flex-col gap-4">
											<Field
												name="regName"
												label="Nombre completo"
												value={regName}
												onChange={setRegName}
												placeholder="Juan Pérez"
											/>
											<Field
												name="regEmail"
												type="email"
												label="Correo electrónico"
												value={regEmail}
												onChange={setRegEmail}
												placeholder="juan.perez@empresa.com"
											/>
											<Field
												name="regPassword"
												type="password"
												label="Contraseña inicial"
												value={regPassword}
												onChange={setRegPassword}
												placeholder="Mínimo 8 caracteres"
											/>
											<Select
												value={regRole}
												onChange={(value) => setRegRole(value as EmployeeRole)}
												variant="secondary"
												isRequired
											>
												<Label className="telemetry mb-1.5 block">Rol</Label>
												<Select.Trigger>
													<Select.Value />
													<Select.Indicator />
												</Select.Trigger>
												<Select.Popover>
													<ListBox>
														{ROLE_OPTIONS.map((role) => (
															<ListBox.Item
																key={role.id}
																id={role.id}
																textValue={role.label}
															>
																{role.label}
																<ListBox.ItemIndicator />
															</ListBox.Item>
														))}
													</ListBox>
												</Select.Popover>
											</Select>

											{regSuccess && (
												<Alert status="success">
													<Alert.Indicator />
													<Alert.Content>
														<Alert.Title>Registrado</Alert.Title>
														<Alert.Description>{regSuccess}</Alert.Description>
													</Alert.Content>
												</Alert>
											)}
											{regError && (
												<Alert status="danger">
													<Alert.Indicator />
													<Alert.Content>
														<Alert.Title>No se pudo registrar</Alert.Title>
														<Alert.Description>{regError}</Alert.Description>
													</Alert.Content>
												</Alert>
											)}
										</Card.Content>
										<Card.Footer className="mt-4">
											<Button
												type="submit"
												variant="primary"
												isPending={createEmployeeMutation.isPending}
												className="w-full justify-center gap-2 font-semibold"
											>
												<UserPlus size={16} />
												Guardar empleado
											</Button>
										</Card.Footer>
									</form>
								</Card>
							</div>

							<div className="lg:col-span-2">
								<Card variant="default">
									<Card.Header>
										<div className="flex items-center justify-between gap-3">
											<Card.Title className="font-display text-base">
												Roster de personal
											</Card.Title>
											<span className="telemetry">
												{employees.length} sujetos · {enrolledCount} con
												biometría
											</span>
										</div>
									</Card.Header>
									<Card.Content className="p-0">
										{employees.length === 0 ? (
											<EmptyState
												title="Sin personal registrado"
												body="Da de alta al primer empleado con el formulario; después captura su rostro."
											/>
										) : (
											<Table variant="secondary">
												<Table.ScrollContainer>
													<Table.Content
														aria-label="Roster de personal"
														className="min-w-[560px]"
													>
														<Table.Header>
															<Table.Column isRowHeader>Sujeto</Table.Column>
															<Table.Column>Rol</Table.Column>
															<Table.Column className="text-center">
																Biometría
															</Table.Column>
															<Table.Column className="text-right">
																Acciones
															</Table.Column>
														</Table.Header>
														<Table.Body>
															{employees.map((emp: any) => (
																<Table.Row key={emp.id} id={emp.id}>
																	<Table.Cell className="py-3">
																		<div className="flex items-center gap-3">
																			<Avatar className="size-8 shrink-0">
																				<Avatar.Fallback className="text-xs">
																					{initials(emp.name)}
																				</Avatar.Fallback>
																			</Avatar>
																			<div className="flex flex-col">
																				<span className="font-medium text-foreground">
																					{emp.name}
																				</span>
																				<span className="readout text-[11px] text-muted">
																					{emp.email}
																				</span>
																			</div>
																		</div>
																	</Table.Cell>
																	<Table.Cell className="py-3 text-muted text-sm">
																		{ROLE_LABEL[emp.role] ?? emp.role ?? "—"}
																	</Table.Cell>
																	<Table.Cell className="py-3 text-center">
																		<Chip
																			color={
																				emp.faceRegistered
																					? "success"
																					: "warning"
																			}
																			variant="soft"
																			size="sm"
																		>
																			{emp.faceRegistered
																				? "Registrada"
																				: "Pendiente"}
																		</Chip>
																	</Table.Cell>
																	<Table.Cell className="py-3 text-right">
																		<div className="flex justify-end gap-2">
																			<Button
																				onPress={() =>
																					setSelectedUserForFace(emp)
																				}
																				variant="secondary"
																				size="sm"
																				isDisabled={emp.faceRegistered}
																				className="gap-1.5"
																			>
																				<Camera size={14} />
																				{emp.faceRegistered
																					? "Enrolada"
																					: "Capturar"}
																			</Button>
																			<Button
																				onPress={() => setUserToDelete(emp)}
																				variant="danger"
																				size="sm"
																				isIconOnly
																				isDisabled={emp.role === "admin"}
																				aria-label={
																					emp.role === "admin"
																						? "No se puede eliminar un administrador"
																						: "Eliminar empleado"
																				}
																			>
																				<Trash2 size={14} />
																			</Button>
																		</div>
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
							</div>
						</div>
					)}
				</Tabs.Panel>

				{/* ── Bitácora ── */}
				<Tabs.Panel id="audit" className="pt-6">
					{loading && auditLogs.length === 0 ? (
						<LoadingRow />
					) : (
						<div className="flex flex-col gap-6">
							<Card variant="default">
								<Card.Header>
									<div className="flex items-center justify-between">
										<Card.Title className="font-display text-base">
											Lectura del instrumento
										</Card.Title>
										<span className="readout text-foreground text-sm">
											{total} <span className="telemetry">eventos</span>
										</span>
									</div>
								</Card.Header>
								<Card.Content className="grid gap-6 sm:grid-cols-2">
									<Meter value={pct(grantedCount)}>
										<div className="flex items-center justify-between">
											<Label className="telemetry">Accesos concedidos</Label>
											<span className="readout text-sm text-success">
												{grantedCount}
											</span>
										</div>
										<Meter.Track className="mt-2">
											<Meter.Fill style={{ background: "var(--success)" }} />
										</Meter.Track>
									</Meter>
									<Meter value={pct(failedCount)}>
										<div className="flex items-center justify-between">
											<Label className="telemetry">Anomalías / fallos</Label>
											<span className="readout text-danger text-sm">
												{failedCount}
											</span>
										</div>
										<Meter.Track className="mt-2">
											<Meter.Fill style={{ background: "var(--danger)" }} />
										</Meter.Track>
									</Meter>
								</Card.Content>
							</Card>

							<Card variant="default">
								<Card.Header>
									<div className="flex items-center justify-between">
										<Card.Title className="font-display text-base">
											Registro de eventos
										</Card.Title>
										<Chip color="accent" variant="soft" size="sm">
											<span className="pulse-dot inline-block size-1.5 rounded-full bg-accent" />
											<span className="telemetry text-[10px]">
												En vivo · SSE
											</span>
										</Chip>
									</div>
								</Card.Header>
								<Card.Content className="p-0">
									{auditLogs.length === 0 ? (
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
														<Table.Column isRowHeader>
															Marca de tiempo
														</Table.Column>
														<Table.Column>Evento</Table.Column>
														<Table.Column>Persona</Table.Column>
														<Table.Column>Origen</Table.Column>
														<Table.Column className="text-right">
															Latencia
														</Table.Column>
													</Table.Header>
													<Table.Body>
														{auditLogs.map((log: any) => {
															const tag = actionTag(log.action);
															return (
																<Table.Row key={log.id} id={log.id}>
																	<Table.Cell className="readout py-3 text-[11px] text-muted">
																		{new Date(log.created_at).toLocaleString(
																			"es-ES",
																		)}
																	</Table.Cell>
																	<Table.Cell className="py-3">
																		<Chip
																			color={tag.color}
																			variant="soft"
																			size="sm"
																		>
																			{tag.label}
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
																		{log.ipAddress || "127.0.0.1"}
																	</Table.Cell>
																	<Table.Cell className="py-3 text-right">
																		{log.details?.latency_ms ? (
																			<span className="readout text-[11px] text-foreground">
																				{Number.parseFloat(
																					log.details.latency_ms,
																				).toFixed(1)}
																				<span className="text-muted"> ms</span>
																			</span>
																		) : log.details?.samples_count ? (
																			<span className="readout text-[11px] text-muted">
																				{log.details.samples_count} capt.
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
						</div>
					)}
				</Tabs.Panel>
			</Tabs>

			<Separator className="my-6" />
			<div className="flex flex-wrap items-center justify-between gap-3">
				<TelemetryRow label="Operador" value={sessionData?.user?.name ?? "—"} />
				<span className="telemetry">Nodo CAF-01 · sesión activa</span>
			</div>

			{/* Modal de enrolamiento facial */}
			<Modal
				isOpen={selectedUserForFace !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) closeFaceRegistration();
				}}
			>
				<Modal.Backdrop variant="blur">
					<Modal.Container size="lg" placement="center" className="text-left">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading className="font-display font-semibold text-base">
									Enrolamiento — {selectedUserForFace?.name}
								</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="pt-2">
								{selectedUserForFace && (
									<FaceEnrollment
										key={selectedUserForFace.id}
										userId={selectedUserForFace.id}
										performedBy={
											sessionData?.user?.name || sessionData?.user?.id
										}
										onSuccess={handleFaceRegistrationSuccess}
										onCancel={closeFaceRegistration}
									/>
								)}
							</Modal.Body>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>

			{/* Modal de confirmación de eliminación */}
			<Modal
				isOpen={userToDelete !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) setUserToDelete(null);
				}}
			>
				<Modal.Backdrop variant="blur">
					<Modal.Container size="sm" placement="center" className="text-left">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading className="flex items-center gap-2 font-display font-semibold text-base">
									<TriangleAlert className="text-warning" size={18} />
									Confirmar eliminación
								</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="pt-2">
								<p className="text-foreground text-sm">
									¿Eliminar de forma permanente a{" "}
									<strong>{userToDelete?.name}</strong>?
								</p>
								<p className="mt-2 text-danger text-sm">
									Esta acción no se puede deshacer y revoca de inmediato todos
									sus accesos biométricos.
								</p>
							</Modal.Body>
							<Modal.Footer className="mt-6 flex justify-end gap-3">
								<Button
									onPress={() => setUserToDelete(null)}
									variant="secondary"
								>
									Cancelar
								</Button>
								<Button
									onPress={() => {
										if (userToDelete) {
											deleteEmployeeMutation.mutate(userToDelete.id);
											setUserToDelete(null);
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
		</main>
	);
}

function LoadingRow() {
	return (
		<div className="flex items-center justify-center py-24 text-muted">
			<RefreshCw className="animate-spin" size={28} />
		</div>
	);
}

function EmptyState({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
			<p className="font-display font-semibold text-[15px] text-foreground">
				{title}
			</p>
			<p className="max-w-sm text-muted text-sm">{body}</p>
		</div>
	);
}

function Field({
	name,
	label,
	value,
	onChange,
	placeholder,
	type,
}: {
	name: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
}) {
	return (
		<TextField
			name={name}
			type={type}
			value={value}
			onChange={onChange}
			isRequired
		>
			<Label className="telemetry mb-1.5 block">{label}</Label>
			<Input placeholder={placeholder} variant="secondary" />
		</TextField>
	);
}
