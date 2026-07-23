import { Alert, Button, Card, Chip, ProgressBar, Spinner } from "@heroui/react";
import { ArrowLeft, ArrowRight, Check, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Reticle } from "#/components/hud";
import { useCamera } from "#/hooks/use-camera";
import {
	type CaptureStep,
	useFaceCaptureFlow,
} from "#/hooks/use-face-capture-flow";
import { type PoseDetection, usePoseDetector } from "#/hooks/use-pose-detector";

export type FaceEnrollmentProps = {
	userId: string;
	performedBy?: string;
	onSuccess: () => void;
	onCancel: () => void;
};

const STEP_LABEL: Record<CaptureStep, string> = {
	front: "Frente",
	right: "Derecha",
	left: "Izquierda",
};

function issueMessage(issue: string, step: CaptureStep): string {
	switch (issue) {
		case "no-face":
			return "Busca tu rostro en el encuadre";
		case "multiple-faces":
			return "Asegúrate de que solo una persona esté visible";
		case "too-far":
			return "Acércate un poco más";
		case "too-close":
			return "Aléjate un poco";
		case "off-center":
			return "Centra tu rostro";
		case "wrong-angle":
			if (step === "front") return "Mira de frente a la cámara";
			if (step === "right") return "Gira lentamente a la derecha";
			return "Gira lentamente a la izquierda";
		case "ok":
			return "Mantén la pose…";
		default:
			return "";
	}
}

async function uploadFrame(
	userId: string,
	imageBase64: string,
	performedBy?: string,
): Promise<void> {
	const res = await fetch("/api/auth/face-biometrics/register-face", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			userId,
			imageBase64,
			mimeType: "image/jpeg",
			performedBy,
		}),
	});
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { message?: string };
		throw new Error(data.message || `Error ${res.status} al registrar rostro`);
	}
}

export function FaceEnrollment({
	userId,
	performedBy,
	onSuccess,
	onCancel,
}: FaceEnrollmentProps) {
	const [debug, setDebug] = useState<PoseDetection | null>(null);
	const camera = useCamera({ facingMode: "user", autoStart: true });

	const { state, handleDetection, reset } = useFaceCaptureFlow({
		capture: camera.capture,
		onComplete: async (frames) => {
			await Promise.all([
				uploadFrame(userId, frames.front.imageBase64, performedBy),
				uploadFrame(userId, frames.right.imageBase64, performedBy),
				uploadFrame(userId, frames.left.imageBase64, performedBy),
			]);
		},
	});

	const onDetection = useCallback(
		(det: PoseDetection) => {
			if (
				!debug ||
				Math.abs(det.yaw - debug.yaw) > 0.5 ||
				Math.abs(det.pitch - debug.pitch) > 0.5 ||
				det.faceCount !== debug.faceCount
			) {
				setDebug(det);
			}
			handleDetection(det);
		},
		[debug, handleDetection],
	);

	const detectorEnabled = camera.state === "ready";
	const detector = usePoseDetector({
		videoRef: camera.videoRef,
		enabled: detectorEnabled,
		onDetection,
		mirrored: true,
	});

	useEffect(() => {
		if (state.phase === "done") {
			const t = setTimeout(onSuccess, 1500);
			return () => clearTimeout(t);
		}
	}, [state.phase, onSuccess]);

	const handleRetry = useCallback(() => {
		reset();
		if (camera.state !== "ready") {
			void camera.start();
		}
	}, [reset, camera]);

	const statusText = useMemo(() => {
		if (state.phase === "uploading") return "Enviando capturas…";
		if (state.phase === "done") return "¡Biometría registrada!";
		if (state.phase === "error") return state.error ?? "Error al registrar";
		return issueMessage(state.issue, state.step);
	}, [state]);

	const aligning = state.phase === "aligning" || state.phase === "holding";
	const reticleTone =
		state.phase === "done"
			? "grant"
			: state.phase === "error"
				? "deny"
				: state.issue === "ok"
					? "grant"
					: "idle";

	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted text-sm">
				Captura biométrica en tres poses. El instrumento auto-captura cada
				plancha cuando la pose es correcta.
			</p>

			<Card variant="secondary" className="overflow-hidden p-0">
				<div className="relative aspect-video w-full bg-black">
					<video
						ref={camera.videoRef}
						autoPlay
						playsInline
						muted
						className="size-full scale-x-[-1] object-cover"
					/>

					{camera.state === "ready" && <Reticle tone={reticleTone} />}

					{/* Estados de carga / error de cámara */}
					{camera.state !== "ready" && (
						<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-sm text-white/90">
							{(camera.state === "requesting" || camera.state === "idle") && (
								<>
									<Spinner />
									<span className="telemetry text-white/80">
										Iniciando cámara…
									</span>
								</>
							)}
							{camera.state === "denied" && (
								<>
									<p className="font-display font-semibold text-white">
										Permiso denegado
									</p>
									<p className="text-white/70 text-xs">
										Habilita la cámara para este sitio y reintenta.
									</p>
									<Button onPress={() => void camera.start()} size="sm">
										Reintentar
									</Button>
								</>
							)}
							{camera.state === "insecure" && (
								<p>La cámara requiere HTTPS o localhost.</p>
							)}
							{camera.state === "unavailable" && (
								<>
									<p className="font-display font-semibold text-white">
										No se detectó cámara
									</p>
									<Button onPress={() => void camera.start()} size="sm">
										Reintentar
									</Button>
								</>
							)}
							{camera.state === "error" && (
								<>
									<p className="font-display font-semibold text-white">
										Error de cámara
									</p>
									<p className="text-white/70 text-xs">
										{camera.error?.message ?? "Fallo desconocido"}
									</p>
									<Button onPress={() => void camera.start()} size="sm">
										Reintentar
									</Button>
								</>
							)}
						</div>
					)}

					{/* Silueta guía facial */}
					{camera.state === "ready" &&
						aligning &&
						state.phase !== "uploading" && (
							<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
								<div
									className={`h-56 w-44 rounded-[50%] border-2 border-dashed shadow-[0_0_0_120px_rgba(0,0,0,0.5)] transition-colors duration-200 ${
										state.issue === "ok" ? "border-success" : "border-accent/70"
									}`}
								/>
							</div>
						)}

					{/* Superior: paso actual */}
					{camera.state === "ready" && aligning && (
						<div className="absolute top-3 left-1/2 z-20 -translate-x-1/2">
							<Chip color="accent" variant="primary" size="sm">
								{state.step === "left" && <ArrowLeft size={13} />}
								{state.step === "front" && <User size={13} />}
								<Chip.Label>{STEP_LABEL[state.step]}</Chip.Label>
								{state.step === "right" && <ArrowRight size={13} />}
							</Chip>
						</div>
					)}

					{/* Inferior: estado + barra de retención */}
					{camera.state === "ready" && aligning && (
						<div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 bg-linear-to-t from-black/85 to-transparent px-4 pt-8 pb-4">
							<p
								className={`font-medium text-sm ${
									state.issue === "ok" ? "text-success" : "text-white"
								}`}
							>
								{statusText}
							</p>
							<ProgressBar
								value={Math.round(state.holdProgress * 100)}
								className="w-48"
								aria-label="Progreso de retención de pose"
							>
								<ProgressBar.Track>
									<ProgressBar.Fill style={{ background: "var(--success)" }} />
								</ProgressBar.Track>
							</ProgressBar>
						</div>
					)}

					{/* Enviando */}
					{state.phase === "uploading" && (
						<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 text-white">
							<Spinner size="lg" />
							<p className="telemetry text-white/80">Enviando capturas…</p>
						</div>
					)}

					{/* Éxito */}
					{state.phase === "done" && (
						<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
							<Chip
								color="success"
								variant="primary"
								size="lg"
								className="lock-in px-4 py-2 font-bold font-display uppercase tracking-wide"
							>
								<Check size={18} strokeWidth={3} />
								<Chip.Label>Biometría registrada</Chip.Label>
							</Chip>
						</div>
					)}

					{/* Error */}
					{state.phase === "error" && (
						<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center">
							<Chip
								color="danger"
								variant="primary"
								size="lg"
								className="lock-in font-bold font-display uppercase"
							>
								Error al registrar
							</Chip>
							<p className="max-w-xs text-white/80 text-xs">{state.error}</p>
							<Button onPress={handleRetry} variant="primary" size="sm">
								Reintentar
							</Button>
						</div>
					)}

					{/* HUD de pose — datos medidos en vivo */}
					{detector.ready && debug && camera.state === "ready" && (
						<div className="readout absolute bottom-2 left-2 z-30 bg-black/70 px-2 py-1 text-[10px] text-white/80 leading-tight">
							<div>yaw {debug.yaw.toFixed(1)}°</div>
							<div>pitch {debug.pitch.toFixed(1)}°</div>
							<div>faces {debug.faceCount}</div>
						</div>
					)}

					{/* Detector cargando */}
					{!detector.ready && !detector.error && camera.state === "ready" && (
						<div className="readout absolute top-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 bg-black/85 px-3 py-1.5 text-[10px] text-white">
							<Spinner size="sm" />
							<span>Cargando modelo facial…</span>
						</div>
					)}
				</div>
			</Card>

			{/* Detector no disponible */}
			{detector.error && camera.state === "ready" && (
				<Alert status="danger">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Detector no disponible</Alert.Title>
						<Alert.Description>{detector.error.message}</Alert.Description>
					</Alert.Content>
				</Alert>
			)}

			{/* Tríptico de planchas */}
			<div className="flex items-center justify-center gap-2">
				{(["front", "right", "left"] as CaptureStep[]).map((s) => {
					const done = state.completed.includes(s);
					const active = state.step === s && !done;
					return (
						<Chip
							key={s}
							color={done ? "success" : active ? "accent" : "default"}
							variant={done || active ? "primary" : "soft"}
							size="sm"
						>
							{done ? <Check size={12} /> : <User size={12} />}
							<Chip.Label>{STEP_LABEL[s]}</Chip.Label>
						</Chip>
					);
				})}
			</div>

			<div className="flex justify-end gap-2">
				<Button onPress={onCancel} variant="secondary">
					Cancelar
				</Button>
			</div>
		</div>
	);
}
