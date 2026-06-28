import { Alert, Button, Card, Input, Label, TextField } from "@heroui/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, RefreshCw, Shield, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: EntryPoint });

function EntryPoint() {
	const navigate = useNavigate();
	const [checking, setChecking] = useState(true);
	const [needsSetup, setNeedsSetup] = useState(false);

	// Estados del formulario de Login
	const [loginEmail, setLoginEmail] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [loginError, setLoginError] = useState<string | null>(null);
	const [loginLoading, setLoginLoading] = useState(false);

	// Estados del formulario de Startup (Setup Admin)
	const [setupName, setSetupName] = useState("");
	const [setupEmail, setSetupEmail] = useState("");
	const [setupPassword, setSetupPassword] = useState("");
	const [setupSecret, setSetupSecret] = useState("");
	const [setupError, setSetupError] = useState<string | null>(null);
	const [setupSuccess, setSetupSuccess] = useState<string | null>(null);
	const [setupLoading, setSetupLoading] = useState(false);

	// Comprobar estado inicial del sistema y sesión
	async function checkSystemState() {
		setChecking(true);
		try {
			// 1. Verificar si hay sesión activa
			const sessionRes = await fetch("/api/auth/get-session");
			if (sessionRes.ok) {
				const sessionData = await sessionRes.json();
				if (sessionData && sessionData.user) {
					// Redirigir inmediatamente si ya está logueado
					navigate({ to: "/admin" });
					return;
				}
			}

			// 2. Verificar si el sistema requiere configuración inicial (no hay usuarios)
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

	// Procesar Inicio de Sesión
	async function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoginError(null);

		if (!loginEmail || !loginPassword) {
			setLoginError("Ingresa tu correo y contraseña.");
			return;
		}

		setLoginLoading(true);

		try {
			const res = await fetch("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: loginEmail,
					password: loginPassword,
				}),
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || "Credenciales de acceso inválidas.");
			}

			// Sesión iniciada correctamente, recargar y redirigir
			window.location.href = "/admin";
		} catch (err: any) {
			setLoginError(err.message || "Fallo de autenticación con el servidor.");
		} finally {
			setLoginLoading(false);
		}
	}

	// Procesar Configuración Inicial de Administrador
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

			setSetupSuccess("Administrador del sistema creado correctamente.");
			setTimeout(() => {
				checkSystemState();
			}, 2000);
		} catch (err: any) {
			setSetupError(err.message || "Error técnico al crear la cuenta raíz.");
		} finally {
			setSetupLoading(false);
		}
	}

	if (checking) {
		return (
			<div className="flex h-[70vh] items-center justify-center bg-background text-foreground">
				<RefreshCw className="animate-spin text-muted" size={32} />
			</div>
		);
	}

	return (
		<main className="flex min-h-[85vh] items-center justify-center bg-background px-4 py-12 text-foreground">
			<div className="w-full max-w-md">
				{/* Identidad del Sistema */}
				<div className="mb-8 animate-fade-in text-center">
					<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-default-100 bg-surface text-foreground shadow-md">
						<Shield size={28} />
					</div>
					<h1 className="font-bold text-2xl text-foreground tracking-tight">
						Control de Acceso Facial
					</h1>
					<p className="mt-1.5 font-semibold text-muted text-xs uppercase tracking-widest">
						Portal de Seguridad Interno
					</p>
				</div>

				{/* Formulario de Configuración Inicial (Startup Page) */}
				{needsSetup ? (
					<Card variant="default" className="w-full">
						<Card.Header className="flex flex-col gap-2 pb-4">
							<Alert status="warning" className="w-full">
								<Alert.Indicator />
								<Alert.Content>
									<Alert.Title>Inicialización Requerida</Alert.Title>
									<Alert.Description>
										No se detecta ningún administrador registrado en el sistema.
										Crea la cuenta administrativa raíz para comenzar.
									</Alert.Description>
								</Alert.Content>
							</Alert>
						</Card.Header>
						<Card.Content>
							<form onSubmit={handleSetup} className="flex flex-col gap-4">
								<TextField
									name="setupName"
									value={setupName}
									onChange={setSetupName}
									isRequired
								>
									<Label className="font-bold text-muted text-xs uppercase tracking-wider">
										Nombre del Administrador
									</Label>
									<Input
										placeholder="Ej. Administrador Principal"
										variant="secondary"
									/>
								</TextField>

								<TextField
									name="setupEmail"
									type="email"
									value={setupEmail}
									onChange={setSetupEmail}
									isRequired
								>
									<Label className="font-bold text-muted text-xs uppercase tracking-wider">
										Correo Electrónico
									</Label>
									<Input placeholder="admin@empresa.com" variant="secondary" />
								</TextField>

								<TextField
									name="setupPassword"
									type="password"
									value={setupPassword}
									onChange={setSetupPassword}
									isRequired
								>
									<Label className="font-bold text-muted text-xs uppercase tracking-wider">
										Contraseña Segura
									</Label>
									<Input
										placeholder="Mínimo 8 caracteres"
										variant="secondary"
									/>
								</TextField>

								<TextField
									name="setupSecret"
									type="password"
									value={setupSecret}
									onChange={setSetupSecret}
									isRequired
								>
									<Label className="font-bold text-muted text-xs uppercase tracking-wider">
										Clave Secreta de Instalación (Setup Secret)
									</Label>
									<Input
										placeholder="Verifica ADMIN_SETUP_SECRET"
										variant="secondary"
									/>
								</TextField>

								{setupError && (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>Error de Configuración</Alert.Title>
											<Alert.Description>{setupError}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}

								{setupSuccess && (
									<Alert status="success">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>Inicialización Exitosa</Alert.Title>
											<Alert.Description>{setupSuccess}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}

								<Button
									type="submit"
									variant="primary"
									isDisabled={setupLoading}
									className="flex w-full items-center justify-center gap-2 py-2.5 font-bold"
								>
									{setupLoading ? (
										<RefreshCw className="animate-spin" size={16} />
									) : (
										<UserPlus size={16} />
									)}
									Inicializar Sistema Raíz
								</Button>
							</form>
						</Card.Content>
					</Card>
				) : (
					/* Formulario de Login Clásico */
					<Card variant="default" className="w-full">
						<Card.Header className="pb-4">
							<Card.Title className="flex items-center gap-2 font-bold text-foreground text-lg">
								<Lock size={18} className="text-muted" />
								Autenticación Requerida
							</Card.Title>
						</Card.Header>
						<Card.Content>
							<form onSubmit={handleLogin} className="flex flex-col gap-4">
								<TextField
									name="loginEmail"
									type="email"
									value={loginEmail}
									onChange={setLoginEmail}
									isRequired
								>
									<Label className="font-bold text-muted text-xs uppercase tracking-wider">
										Correo Electrónico
									</Label>
									<Input placeholder="admin@empresa.com" variant="secondary" />
								</TextField>

								<TextField
									name="loginPassword"
									type="password"
									value={loginPassword}
									onChange={setLoginPassword}
									isRequired
								>
									<Label className="font-bold text-muted text-xs uppercase tracking-wider">
										Contraseña
									</Label>
									<Input placeholder="••••••••" variant="secondary" />
								</TextField>

								{loginError && (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>Fallo de Inicio de Sesión</Alert.Title>
											<Alert.Description>{loginError}</Alert.Description>
										</Alert.Content>
									</Alert>
								)}

								<Button
									type="submit"
									variant="primary"
									isDisabled={loginLoading}
									className="flex w-full items-center justify-center gap-2 py-2.5 font-bold"
								>
									{loginLoading ? (
										<RefreshCw className="animate-spin" size={16} />
									) : (
										<Shield size={16} />
									)}
									Ingresar al Sistema
								</Button>
							</form>
						</Card.Content>
					</Card>
				)}
			</div>
		</main>
	);
}
