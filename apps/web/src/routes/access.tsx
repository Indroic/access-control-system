import { Alert, Button, Card, Chip } from "@heroui/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ScanFace, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Brandmark,
	Reticle,
	TelemetryRow,
	ThermalLegend,
} from "#/components/hud";

export const Route = createFileRoute("/access")({ component: AccessKiosk });

type KioskStatus =
	| "loading-camera"
	| "idle"
	| "capturing"
	| "matching"
	| "opening"
	| "success"
	| "failed";

// Etiqueta única por estado — un solo nodo de texto evita errores de
// reconciliación de React del tipo "insertBefore ... is not a child of this node".
const STATUS_LABELS: Record<KioskStatus, string> = {
	"loading-camera": "Iniciando sensor",
	idle: "Sensor activo · listo",
	capturing: "Capturando cuadro",
	matching: "Cotejando firma · pgvector",
	opening: "Validando · accionando relé",
	success: "Identidad verificada",
	failed: "Sin coincidencia",
};

function AccessKiosk() {
	const navigate = useNavigate();
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);

	const [status, setStatus] = useState<KioskStatus>("loading-camera");
	const [errorMsg, setErrorMsg] = useState("");
	const [identifiedUser, setIdentifiedUser] = useState<{
		name: string;
		email: string;
	} | null>(null);
	const [countdown, setCountdown] = useState(5);
	const [hardwarePending, setHardwarePending] = useState(false);

	// Inicializar cámara web
	useEffect(() => {
		async function startCamera() {
			try {
				const mediaStream = await navigator.mediaDevices.getUserMedia({
					video: { width: 640, height: 480, facingMode: "user" },
					audio: false,
				});
				streamRef.current = mediaStream;
				if (videoRef.current) videoRef.current.srcObject = mediaStream;
				setStatus("idle");
			} catch (err) {
				console.error("Error al acceder a la cámara:", err);
				setStatus("failed");
				setErrorMsg(
					"No se pudo acceder a la cámara. Otorga permisos y recarga el kiosco.",
				);
			}
		}
		startCamera();
		return () => {
			streamRef.current?.getTracks().forEach((track) => {
				track.stop();
			});
		};
	}, []);

	// Cuenta regresiva para volver a inactivo tras un veredicto
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		if ((status === "success" || status === "failed") && countdown > 0) {
			timer = setTimeout(() => setCountdown(countdown - 1), 1000);
		} else if (
			countdown === 0 &&
			(status === "success" || status === "failed")
		) {
			resetKiosk();
		}
		return () => clearTimeout(timer);
	}, [status, countdown]);

	function resetKiosk() {
		setStatus("idle");
		setIdentifiedUser(null);
		setErrorMsg("");
		setCountdown(5);
		setHardwarePending(false);
	}

	async function handleScan() {
		if (status !== "idle" || !videoRef.current || !canvasRef.current) return;
		setStatus("capturing");
		const video = videoRef.current;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			setStatus("failed");
			setErrorMsg("Error de renderizado del cuadro de cámara.");
			return;
		}
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		const base64Image = canvas.toDataURL("image/jpeg", 0.9);

		setStatus("matching");
		try {
			const authRes = await fetch(
				"/api/auth/face-biometrics/authenticate-face",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						imageBase64: base64Image,
						mimeType: "image/jpeg",
					}),
				},
			);
			if (!authRes.ok) {
				const errData = await authRes.json().catch(() => ({}));
				throw new Error(
					errData.message || "No se reconoció ninguna coincidencia facial.",
				);
			}
			const authData = await authRes.json();
			const user = authData.user;
			setIdentifiedUser({ name: user.name, email: user.email });
			setStatus("opening");
			await new Promise((resolve) => setTimeout(resolve, 1000));
			// El relé de puerta aún no está implementado.
			setHardwarePending(true);
			setStatus("success");
		} catch (err: any) {
			console.error(err);
			setStatus("failed");
			setErrorMsg(
				err.message || "Error técnico durante la verificación facial.",
			);
		}
	}

	const scanning =
		status === "capturing" || status === "matching" || status === "opening";
	const verdict = status === "success" || status === "failed";
	const reticleTone =
		status === "success" ? "grant" : status === "failed" ? "deny" : "idle";

	return (
		<main
			translate="no"
			className="flex min-h-screen flex-col px-4 py-6 sm:px-8"
		>
			<header className="mx-auto flex w-full max-w-5xl items-center justify-between">
				<Button
					variant="tertiary"
					size="sm"
					className="gap-2"
					onPress={() => navigate({ to: "/" })}
				>
					<ArrowLeft size={16} />
					Volver
				</Button>
				<Brandmark sub="Kiosco · umbral de acceso" />
			</header>

			<div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center py-8">
				<div className="fade-rise grid w-full gap-5 lg:grid-cols-[1.6fr_1fr]">
					{/* El sensor: cámara enmarcada en la retícula de adquisición */}
					<Card variant="secondary" className="overflow-hidden p-0">
						<div className="relative aspect-[4/3] w-full bg-black sm:aspect-video">
							<video
								ref={videoRef}
								autoPlay
								playsInline
								muted
								className={`size-full object-cover transition-opacity duration-500 ${
									verdict ? "opacity-30" : "opacity-100"
								}`}
							/>
							<canvas ref={canvasRef} className="hidden" />

							<Reticle tone={verdict ? reticleTone : "idle"} />
							{scanning && <div className="scan-beam" />}

							{/* Veredicto — el enganche del objetivo */}
							{verdict && (
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
									<Chip
										color={status === "success" ? "success" : "danger"}
										variant="primary"
										size="lg"
										className="lock-in px-4 py-2 font-bold font-display text-base uppercase tracking-wide"
									>
										{status === "success" ? (
											<Check size={18} strokeWidth={3} />
										) : (
											<X size={18} strokeWidth={3} />
										)}
										<Chip.Label>
											{status === "success"
												? hardwarePending
													? "Identidad verificada"
													: "Acceso concedido"
												: "Acceso denegado"}
										</Chip.Label>
									</Chip>
									{status === "success" && identifiedUser && (
										<div>
											<p className="font-display font-semibold text-lg text-white">
												{identifiedUser.name}
											</p>
											<p className="readout text-[11px] text-white/70">
												{identifiedUser.email}
											</p>
										</div>
									)}
									{status === "failed" && (
										<p className="max-w-sm text-sm text-white/85">
											{errorMsg ||
												"No se encontró un rostro registrado coincidente."}
										</p>
									)}
								</div>
							)}
						</div>
					</Card>

					{/* Telemetría + control */}
					<div className="flex flex-col gap-4">
						<Card variant="default">
							<Card.Header>
								<div className="flex items-center justify-between">
									<Card.Title className="font-display text-sm">
										Telemetría
									</Card.Title>
									<Chip
										color={
											status === "failed"
												? "danger"
												: status === "success"
													? "success"
													: scanning
														? "accent"
														: "success"
										}
										variant="soft"
										size="sm"
									>
										<span
											className={`inline-block size-1.5 rounded-full ${scanning || status === "idle" ? "pulse-dot" : ""}`}
											style={{ background: "currentColor" }}
										/>
										<span className="telemetry text-[10px]">
											{status === "idle"
												? "Listo"
												: scanning
													? "Activo"
													: verdict
														? status === "success"
															? "OK"
															: "Fallo"
														: "Init"}
										</span>
									</Chip>
								</div>
								<ThermalLegend className="mt-2 w-full" />
							</Card.Header>
							<Card.Content>
								<TelemetryRow
									label="Estado"
									value={STATUS_LABELS[status]}
									tone={
										status === "success"
											? "grant"
											: status === "failed"
												? "deny"
												: scanning
													? "accent"
													: "default"
									}
								/>
								<TelemetryRow
									label="Sujeto"
									value={identifiedUser?.name ?? "—"}
								/>
								<TelemetryRow label="Sensor" value="640×480 · frontal" />
								<TelemetryRow label="Nodo" value="CAF-01" />
							</Card.Content>
						</Card>

						{status === "success" && hardwarePending && (
							<Alert status="warning">
								<Alert.Indicator />
								<Alert.Content>
									<Alert.Title>Apertura pendiente</Alert.Title>
									<Alert.Description>
										La identidad se verificó; el relé de puerta aún no está
										conectado al hardware de este despliegue.
									</Alert.Description>
								</Alert.Content>
							</Alert>
						)}

						{verdict ? (
							<div className="flex items-center justify-between gap-3">
								<span className="telemetry">
									Reinicio en{" "}
									<span className="readout text-foreground">{countdown}s</span>
								</span>
								<Button
									onPress={resetKiosk}
									variant={status === "failed" ? "primary" : "secondary"}
								>
									{status === "failed" ? "Reintentar" : "Nuevo escaneo"}
								</Button>
							</div>
						) : (
							<Button
								onPress={handleScan}
								variant="primary"
								size="lg"
								isDisabled={status !== "idle"}
								className="w-full justify-center gap-2.5 font-semibold"
							>
								<ScanFace size={20} />
								Adquirir rostro
							</Button>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}
