import {
	Alert,
	Button,
	Card,
	Chip,
	Form,
	Input,
	Label,
	Separator,
	TextField,
} from "@heroui/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import {
	AccessMark,
	Brandmark,
	TelemetryRow,
	ThermalLegend,
} from "#/components/hud";
import { authClient } from "#/utils/auth-client";

export const Route = createFileRoute("/")({ component: EntryPoint });

function EntryPoint() {
	const navigate = useNavigate();
	const [checking, setChecking] = useState(true);
	const [needsSetup, setNeedsSetup] = useState(false);

	// Estados del formulario de inicio de sesión
	const [loginEmail, setLoginEmail] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [loginError, setLoginError] = useState<string | null>(null);
	const [loginLoading, setLoginLoading] = useState(false);

	// Estados del formulario de configuración inicial (root)
	const [setupName, setSetupName] = useState("");
	const [setupEmail, setSetupEmail] = useState("");
	const [setupPassword, setSetupPassword] = useState("");
	const [setupSecret, setSetupSecret] = useState("");
	const [setupError, setSetupError] = useState<string | null>(null);
	const [setupSuccess, setSetupSuccess] = useState<string | null>(null);
	const [setupLoading, setSetupLoading] = useState(false);

	async function checkSystemState() {
		setChecking(true);
		try {
			const { data: sessionData } = await authClient.getSession();
			if (sessionData?.user) {
				navigate({ to: "/admin" });
				return;
			}
			const setupRes = await fetch("/api/setup-status");
			if (setupRes.ok) {
				const setupData = await setupRes.json();
				setNeedsSetup(setupData.needsSetup);
			}
		} catch (err) {
			console.error("Error al comprobar estado del sistema:", err);
		} finally {
			setChecking(false);
		}
	}

	useEffect(() => {
		checkSystemState();
	}, []);

	async function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoginError(null);
		if (!loginEmail || !loginPassword) {
			setLoginError("Ingresa tu correo y contraseña.");
			return;
		}
		setLoginLoading(true);
		try {
			const { error } = await authClient.signIn.email({
				email: loginEmail,
				password: loginPassword,
			});
			if (error)
				throw new Error(error.message || "Credenciales de acceso inválidas.");
			window.location.href = "/admin";
		} catch (err: any) {
			setLoginError(err.message || "Fallo de autenticación con el servidor.");
		} finally {
			setLoginLoading(false);
		}
	}

	async function handleSetup(e: React.FormEvent) {
		e.preventDefault();
		setSetupError(null);
		setSetupSuccess(null);
		if (!setupName || !setupEmail || !setupPassword || !setupSecret) {
			setSetupError("Todos los campos son obligatorios.");
			return;
		}
		setSetupLoading(true);
		try {
			const res = await fetch("/api/setup-admin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: setupName,
					email: setupEmail,
					password: setupPassword,
					secret: setupSecret,
				}),
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(
					errData.error || "Error en la inicialización administrativa.",
				);
			}
			setSetupSuccess("Administrador raíz creado. Redirigiendo…");
			setTimeout(() => checkSystemState(), 1600);
		} catch (err: any) {
			setSetupError(err.message || "Error técnico al crear la cuenta raíz.");
		} finally {
			setSetupLoading(false);
		}
	}

	if (checking) {
		return (
			<main className="flex min-h-screen items-center justify-center px-4">
				<div className="flex flex-col items-center gap-4 text-muted">
					<span className="text-accent">
						<AccessMark size={44} className="pulse-dot" />
					</span>
					<p className="telemetry">Adquiriendo estado del sistema…</p>
				</div>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen items-center justify-center px-4 py-14">
			<div className="fade-rise w-full max-w-[27rem]">
				<Brandmark className="mb-6" />

				<Card variant="default">
					<Card.Header className="gap-3">
						<div className="flex w-full items-center justify-between">
							<Card.Title className="font-display text-lg">
								{needsSetup ? "Puesta en marcha" : "Autenticación"}
							</Card.Title>
							<Chip
								color={needsSetup ? "warning" : "success"}
								variant="soft"
								size="sm"
							>
								<span className="telemetry text-[10px]">
									{needsSetup ? "Sin admin" : "En línea"}
								</span>
							</Chip>
						</div>
						<Card.Description>
							{needsSetup
								? "No hay administrador registrado. Crea la cuenta raíz con la clave de instalación."
								: "Acceso de personal al panel de control y a la bitácora de accesos."}
						</Card.Description>
						<ThermalLegend className="mt-1 w-full" />
					</Card.Header>

					{needsSetup ? (
						<Form onSubmit={handleSetup}>
							<Card.Content className="flex flex-col gap-4">
								<Field
									name="setupName"
									label="Nombre del administrador"
									value={setupName}
									onChange={setSetupName}
									placeholder="Administrador principal"
								/>
								<Field
									name="setupEmail"
									type="email"
									label="Correo electrónico"
									value={setupEmail}
									onChange={setSetupEmail}
									placeholder="admin@empresa.com"
								/>
								<Field
									name="setupPassword"
									type="password"
									label="Contraseña segura"
									value={setupPassword}
									onChange={setSetupPassword}
									placeholder="Mínimo 8 caracteres"
								/>
								<Field
									name="setupSecret"
									type="password"
									label="Clave de instalación · ADMIN_SETUP_SECRET"
									value={setupSecret}
									onChange={setSetupSecret}
									placeholder="Secreto de despliegue"
								/>
								{setupError && (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>No se pudo inicializar</Alert.Title>
											<Alert.Description>{setupError}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}
								{setupSuccess && (
									<Alert status="success">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>Sistema inicializado</Alert.Title>
											<Alert.Description>{setupSuccess}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}
							</Card.Content>
							<Card.Footer className="mt-4">
								<Button
									type="submit"
									variant="primary"
									isPending={setupLoading}
									className="w-full justify-center gap-2 font-semibold"
								>
									{setupLoading ? "Inicializando…" : "Inicializar cuenta raíz"}
									{!setupLoading && <ArrowRight size={16} />}
								</Button>
							</Card.Footer>
						</Form>
					) : (
						<Form onSubmit={handleLogin}>
							<Card.Content className="flex flex-col gap-4">
								<Field
									name="loginEmail"
									type="email"
									label="Correo electrónico"
									value={loginEmail}
									onChange={setLoginEmail}
									placeholder="admin@empresa.com"
								/>
								<Field
									name="loginPassword"
									type="password"
									label="Contraseña"
									value={loginPassword}
									onChange={setLoginPassword}
									placeholder="••••••••"
								/>
								{loginError && (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>No se pudo iniciar sesión</Alert.Title>
											<Alert.Description>{loginError}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}
							</Card.Content>
							<Card.Footer className="mt-4">
								<Button
									type="submit"
									variant="primary"
									isPending={loginLoading}
									className="w-full justify-center gap-2 font-semibold"
								>
									{loginLoading ? "Verificando…" : "Ingresar al sistema"}
									{!loginLoading && <ArrowRight size={16} />}
								</Button>
							</Card.Footer>
						</Form>
					)}
				</Card>

				<Separator className="my-5" />

				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0 flex-1">
						<TelemetryRow label="Nodo" value="CAF-01" />
						<TelemetryRow
							label="Modo"
							value={needsSetup ? "SETUP" : "AUTH"}
							tone="accent"
						/>
					</div>
					<Button
						variant="secondary"
						size="sm"
						className="gap-2 self-end"
						onPress={() => navigate({ to: "/access" })}
					>
						<ScanFace size={16} />
						Abrir kiosco
					</Button>
				</div>
			</div>
		</main>
	);
}

/* Composes HeroUI TextField + Label + Input in the instrument's label voice. */
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
