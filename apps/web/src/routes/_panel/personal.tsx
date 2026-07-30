import {
	Alert,
	Avatar,
	Button,
	Card,
	Chip,
	Input,
	Label,
	ListBox,
	Modal,
	Select,
	Separator,
	Table,
	TextField,
	toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Camera,
	Images,
	RefreshCw,
	Trash2,
	TriangleAlert,
	UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "#/components/app-shell";
import { FaceEnrollment } from "#/components/face-enrollment";
import {
	EmptyState,
	Field,
	formatDateTime,
	initials,
	LoadingRow,
} from "#/components/panel-bits";
import { UserGallery, type UserImage } from "#/components/user-gallery";
import { normalizeRole, ROLE_LABEL } from "#/lib/navigation";
import { trpcMutate, trpcQuery } from "#/lib/trpc";
import { authClient } from "#/utils/auth-client";

export const Route = createFileRoute("/_panel/personal")({
	component: PersonalPage,
});

type EmployeeRole = "user" | "jefe" | "gerente" | "admin";

const ROLE_OPTIONS: { id: EmployeeRole; label: string }[] = [
	{ id: "user", label: "Empleado" },
	{ id: "jefe", label: "Jefe" },
	{ id: "gerente", label: "Gerente" },
	{ id: "admin", label: "Administrador" },
];

type Employee = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	faceRegistered: boolean;
	role: string;
	createdAt: string;
	imageCount: number;
};

type UserDetail = {
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: boolean;
		faceRegistered: boolean;
		role: string;
		banned: boolean;
		createdAt: string;
		updatedAt: string;
	};
	images: UserImage[];
};

function PersonalPage() {
	const queryClient = useQueryClient();
	const { data: sessionData } = authClient.useSession();
	const currentRole = normalizeRole(
		(sessionData?.user as { role?: string } | undefined)?.role,
	);
	const canManage = currentRole === "admin";

	const [query, setQuery] = useState("");
	const [showRegister, setShowRegister] = useState(false);
	const [userToDelete, setUserToDelete] = useState<Employee | null>(null);
	const [selectedUserForFace, setSelectedUserForFace] =
		useState<Employee | null>(null);
	const [detailUserId, setDetailUserId] = useState<string | null>(null);

	const [regName, setRegName] = useState("");
	const [regEmail, setRegEmail] = useState("");
	const [regPassword, setRegPassword] = useState("");
	const [regRole, setRegRole] = useState<EmployeeRole>("user");
	const [regError, setRegError] = useState<string | null>(null);

	const {
		data: employees = [],
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["employees"],
		queryFn: () => trpcQuery<Employee[]>("users.list"),
	});

	const { data: detail, isLoading: detailLoading } = useQuery({
		queryKey: ["userDetail", detailUserId],
		queryFn: () =>
			trpcQuery<UserDetail>("users.detail", { userId: detailUserId }),
		enabled: detailUserId !== null,
	});

	const createEmployee = useMutation({
		mutationFn: async (input: {
			name: string;
			email: string;
			password: string;
			role: EmployeeRole;
		}) => {
			const { data, error } = await authClient.admin.createUser(input);
			if (error) {
				throw new Error(error.message || "Error al registrar al empleado.");
			}
			return data;
		},
		onSuccess: (data) => {
			toast.success(`${regName} registrado. Captura su rostro para activarlo.`);
			setRegName("");
			setRegEmail("");
			setRegPassword("");
			setRegRole("user");
			setRegError(null);
			setShowRegister(false);
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			// Encadena el enrolamiento facial del recién creado.
			if (data?.user) setSelectedUserForFace(data.user as unknown as Employee);
		},
		onError: (error: Error) => {
			const message = error.message || "Fallo técnico al registrar empleado.";
			setRegError(message);
			toast.danger(message);
		},
	});

	const deleteEmployee = useMutation({
		mutationFn: (userId: string) =>
			trpcMutate<{ success: boolean }>("users.delete", { userId }),
		onSuccess: () => {
			toast.success("Empleado eliminado.");
			queryClient.invalidateQueries({ queryKey: ["employees"] });
		},
		onError: (error: Error) => {
			toast.danger(error.message || "Fallo técnico al eliminar empleado.");
		},
	});

	function handleCreateEmployee(event: React.FormEvent) {
		event.preventDefault();
		setRegError(null);
		if (!regName || !regEmail || !regPassword) {
			const message = "Todos los campos son obligatorios.";
			setRegError(message);
			toast.danger(message);
			return;
		}
		createEmployee.mutate({
			name: regName,
			email: regEmail,
			password: regPassword,
			role: regRole,
		});
	}

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return employees;
		return employees.filter(
			(employee) =>
				employee.name?.toLowerCase().includes(needle) ||
				employee.email?.toLowerCase().includes(needle),
		);
	}, [employees, query]);

	return (
		<>
			<PageHeader
				title="Personal"
				subtitle="Roster de empleados, roles y evidencia fotográfica de registro."
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
						{canManage && (
							<Button
								onPress={() => {
									setRegError(null);
									setShowRegister(true);
								}}
								variant="primary"
								size="sm"
								className="gap-1.5"
							>
								<UserPlus size={15} />
								Registrar
							</Button>
						)}
					</>
				}
			/>

			<Card variant="default">
				<Card.Header>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Card.Title className="font-display text-base">
							Roster de personal
						</Card.Title>
						<TextField
							aria-label="Buscar personal"
							value={query}
							onChange={setQuery}
							className="w-full max-w-56"
						>
							<Input
								type="search"
								variant="secondary"
								placeholder="Buscar nombre o correo"
							/>
						</TextField>
					</div>
				</Card.Header>
				<Card.Content className="p-0">
					{isLoading && employees.length === 0 ? (
						<LoadingRow />
					) : filtered.length === 0 ? (
						<EmptyState
							title={query ? "Sin coincidencias" : "Sin personal registrado"}
							body={
								query
									? "Ningún empleado coincide con la búsqueda."
									: "Usa “Registrar” para dar de alta al primer empleado y capturar su rostro."
							}
						/>
					) : (
						<Table variant="secondary">
							<Table.ScrollContainer>
								<Table.Content
									aria-label="Roster de personal"
									className="min-w-[680px]"
								>
									<Table.Header>
										<Table.Column isRowHeader>Sujeto</Table.Column>
										<Table.Column>Rol</Table.Column>
										<Table.Column className="text-center">
											Biometría
										</Table.Column>
										<Table.Column className="text-center">
											Evidencia
										</Table.Column>
										<Table.Column className="text-right">Acciones</Table.Column>
									</Table.Header>
									<Table.Body>
										{filtered.map((employee) => (
											<Table.Row key={employee.id} id={employee.id}>
												<Table.Cell className="py-3">
													<button
														type="button"
														onClick={() => setDetailUserId(employee.id)}
														className="flex items-center gap-3 text-left transition-opacity hover:opacity-80"
													>
														<Avatar className="size-8 shrink-0">
															<Avatar.Fallback className="text-xs">
																{initials(employee.name)}
															</Avatar.Fallback>
														</Avatar>
														<span className="flex flex-col">
															<span className="font-medium text-foreground">
																{employee.name}
															</span>
															<span className="readout text-[11px] text-muted">
																{employee.email}
															</span>
														</span>
													</button>
												</Table.Cell>
												<Table.Cell className="py-3 text-muted text-sm">
													{ROLE_LABEL[employee.role] ?? employee.role ?? "—"}
												</Table.Cell>
												<Table.Cell className="py-3 text-center">
													<Chip
														color={
															employee.faceRegistered ? "success" : "warning"
														}
														variant="soft"
														size="sm"
													>
														<Chip.Label>
															{employee.faceRegistered
																? "Registrada"
																: "Pendiente"}
														</Chip.Label>
													</Chip>
												</Table.Cell>
												<Table.Cell className="py-3 text-center">
													<Button
														onPress={() => setDetailUserId(employee.id)}
														variant="tertiary"
														size="sm"
														className="gap-1.5"
													>
														<Images size={14} />
														<span className="readout text-[11px]">
															{employee.imageCount}
														</span>
													</Button>
												</Table.Cell>
												<Table.Cell className="py-3 text-right">
													<div className="flex justify-end gap-2">
														{canManage && (
															<Button
																onPress={() => setSelectedUserForFace(employee)}
																variant="secondary"
																size="sm"
																isDisabled={employee.faceRegistered}
																className="gap-1.5"
															>
																<Camera size={14} />
																{employee.faceRegistered
																	? "Enrolada"
																	: "Capturar"}
															</Button>
														)}
														{canManage && (
															<Button
																onPress={() => setUserToDelete(employee)}
																variant="danger"
																size="sm"
																isIconOnly
																isDisabled={employee.role === "admin"}
																aria-label={
																	employee.role === "admin"
																		? "No se puede eliminar un administrador"
																		: "Eliminar empleado"
																}
															>
																<Trash2 size={14} />
															</Button>
														)}
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

			{/* ── Ficha de usuario con evidencia fotográfica ── */}
			<Modal
				isOpen={detailUserId !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) setDetailUserId(null);
				}}
			>
				<Modal.Backdrop variant="blur">
					<Modal.Container size="lg" placement="center" className="text-left">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading className="flex items-center gap-2.5 font-display font-semibold text-base">
									<Avatar className="size-8 shrink-0">
										<Avatar.Fallback className="text-xs">
											{initials(detail?.user.name)}
										</Avatar.Fallback>
									</Avatar>
									{detail?.user.name ?? "Ficha del usuario"}
								</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="pt-2">
								{detail && (
									<>
										<dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
											<DetailItem label="Correo" value={detail.user.email} />
											<DetailItem
												label="Rol"
												value={ROLE_LABEL[detail.user.role] ?? detail.user.role}
											/>
											<DetailItem
												label="Biometría"
												value={
													detail.user.faceRegistered
														? "Registrada"
														: "Pendiente"
												}
											/>
											<DetailItem
												label="Alta"
												value={formatDateTime(detail.user.createdAt)}
											/>
											<DetailItem
												label="Actualizado"
												value={formatDateTime(detail.user.updatedAt)}
											/>
											<DetailItem
												label="Estado"
												value={detail.user.banned ? "Bloqueado" : "Activo"}
											/>
										</dl>

										<Separator className="my-5" />

										<h3 className="mb-3 font-display font-semibold text-foreground text-sm">
											Evidencia fotográfica de registro
										</h3>
										<UserGallery
											images={detail.images}
											isLoading={detailLoading}
										/>
									</>
								)}
								{!detail && detailLoading && <LoadingRow />}
							</Modal.Body>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>

			{/* ── Alta de personal ── */}
			<Modal
				isOpen={showRegister}
				onOpenChange={(isOpen) => {
					if (!isOpen) setShowRegister(false);
				}}
			>
				<Modal.Backdrop variant="blur">
					<Modal.Container size="md" placement="center" className="text-left">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading className="flex items-center gap-2 font-display font-semibold text-base">
									<UserPlus size={18} className="text-accent" />
									Registrar empleado
								</Modal.Heading>
							</Modal.Header>
							<form onSubmit={handleCreateEmployee}>
								<Modal.Body className="flex flex-col gap-4 pt-2">
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
									{regError && (
										<Alert status="danger">
											<Alert.Indicator />
											<Alert.Content>
												<Alert.Title>No se pudo registrar</Alert.Title>
												<Alert.Description>{regError}</Alert.Description>
											</Alert.Content>
										</Alert>
									)}
								</Modal.Body>
								<Modal.Footer className="mt-6 flex justify-end gap-3">
									<Button
										type="button"
										variant="secondary"
										onPress={() => setShowRegister(false)}
									>
										Cancelar
									</Button>
									<Button
										type="submit"
										variant="primary"
										isPending={createEmployee.isPending}
										className="gap-2 font-semibold"
									>
										<UserPlus size={16} />
										Guardar
									</Button>
								</Modal.Footer>
							</form>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>

			{/* ── Enrolamiento facial ── */}
			<Modal
				isOpen={selectedUserForFace !== null}
				onOpenChange={(isOpen) => {
					if (!isOpen) setSelectedUserForFace(null);
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
										performedBy={sessionData?.user?.id}
										onSuccess={() => {
											refetch();
											toast.success("Biometría registrada correctamente.");
										}}
										onCancel={() => setSelectedUserForFace(null)}
									/>
								)}
							</Modal.Body>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>

			{/* ── Confirmación de eliminación ── */}
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
									Esta acción no se puede deshacer, revoca de inmediato sus
									accesos biométricos y borra su evidencia fotográfica.
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
											deleteEmployee.mutate(userToDelete.id);
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
		</>
	);
}

function DetailItem({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="telemetry">{label}</dt>
			<dd className="mt-1 truncate text-foreground text-sm">{value}</dd>
		</div>
	);
}
