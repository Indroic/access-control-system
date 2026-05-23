import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	CheckCircle,
	User,
} from "lucide-react";
import { useCamera } from "#/hooks/use-camera";
import {
	type PoseDetection,
	usePoseDetector,
} from "#/hooks/use-pose-detector";
import {
	type CaptureStep,
	useFaceCaptureFlow,
} from "#/hooks/use-face-capture-flow";

export type FaceEnrollmentProps = {
	userId: string;
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
): Promise<void> {
	const res = await fetch("/api/auth/face-biometrics/register-face", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ userId, imageBase64, mimeType: "image/jpeg" }),
	});
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { message?: string };
		throw new Error(data.message || `Error ${res.status} al registrar rostro`);
	}
}

export function FaceEnrollment({
	userId,
	onSuccess,
	onCancel,
}: FaceEnrollmentProps) {
	const [debug, setDebug] = useState<PoseDetection | null>(null);
	const camera = useCamera({ facingMode: "user", autoStart: true });
	const { state, handleDetection, reset } = useFaceCaptureFlow({
		capture: camera.capture,
		onComplete: async (frames) => {
			await uploadFrame(userId, frames.front.imageBase64);
			await uploadFrame(userId, frames.right.imageBase64);
			await uploadFrame(userId, frames.left.imageBase64);
		},
	});

	const onDetection = useCallback(
		(det: PoseDetection) => {
			// Throttle debug HUD updates so we don't re-render every frame.
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

	return (
		<div className="flex flex-col gap-4">
			<div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-zinc-800">
				<video
					ref={camera.videoRef}
					autoPlay
					playsInline
					muted
					className="h-full w-full scale-x-[-1] object-cover"
				/>

				{/* Camera loading / error states */}
				{camera.state !== "ready" && (
					<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 p-6 text-center text-sm text-white/90">
						{(camera.state === "requesting" || camera.state === "idle") && (
							<>
								<Spinner />
								<span>Iniciando cámara…</span>
							</>
						)}
						{camera.state === "denied" && (
							<>
								<p className="font-medium">Permiso de cámara denegado</p>
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
								<p className="font-medium">No se detectó cámara</p>
								<Button onPress={() => void camera.start()} size="sm">
									Reintentar
								</Button>
							</>
						)}
						{camera.state === "error" && (
							<>
								<p className="font-medium">Error de cámara</p>
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

				{/* Face guide silhouette */}
				{camera.state === "ready" &&
					state.phase !== "uploading" &&
					state.phase !== "done" &&
					state.phase !== "error" && (
						<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
							<div
								className={`h-56 w-44 rounded-[50%] border-4 border-dashed shadow-[0_0_0_120px_rgba(9,9,11,0.55)] transition-colors duration-200 ${
									state.issue === "ok"
										? "border-emerald-400"
										: state.step === "front"
											? "border-zinc-400"
											: state.step === "right"
												? "border-blue-400"
												: "border-purple-400"
								}`}
							/>
						</div>
					)}

				{/* Top: direction arrow + step label */}
				{camera.state === "ready" &&
					(state.phase === "aligning" || state.phase === "holding") && (
						<div className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950/80 px-4 py-1.5 text-xs font-bold text-zinc-100">
							{state.step === "left" && <ArrowLeft size={14} />}
							{state.step === "front" && <User size={14} />}
							<span>Paso: {STEP_LABEL[state.step]}</span>
							{state.step === "right" && <ArrowRight size={14} />}
						</div>
					)}

				{/* Bottom: status + hold progress */}
				{camera.state === "ready" &&
					(state.phase === "aligning" || state.phase === "holding") && (
						<div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 bg-gradient-to-t from-zinc-950/90 to-transparent px-4 pt-6 pb-4">
							<p
								className={`text-sm font-semibold ${
									state.issue === "ok" ? "text-emerald-300" : "text-zinc-100"
								}`}
							>
								{statusText}
							</p>
							<div className="h-1.5 w-48 overflow-hidden rounded-full bg-zinc-800">
								<div
									className="h-full bg-emerald-400 transition-[width] duration-100"
									style={{ width: `${state.holdProgress * 100}%` }}
								/>
							</div>
						</div>
					)}

				{/* Uploading overlay */}
				{state.phase === "uploading" && (
					<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-950/85 text-white">
						<Spinner size="lg" />
						<p className="text-sm font-semibold">Enviando capturas…</p>
					</div>
				)}

				{/* Success overlay */}
				{state.phase === "done" && (
					<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-emerald-950/90 text-emerald-200">
						<CheckCircle size={48} className="animate-in zoom-in" />
						<p className="text-base font-bold">¡Biometría guardada!</p>
					</div>
				)}

				{/* Error overlay */}
				{state.phase === "error" && (
					<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-red-950/90 px-6 text-center text-red-200">
						<AlertTriangle size={40} />
						<p className="text-base font-bold">Error al registrar</p>
						<p className="text-xs text-red-300">{state.error}</p>
						<Button onPress={handleRetry} variant="primary" size="sm">
							Reintentar
						</Button>
					</div>
				)}

				{/* Detector error */}
				{detector.error && camera.state === "ready" && (
					<div className="absolute top-16 left-1/2 z-30 -translate-x-1/2 rounded-md bg-red-950/85 px-3 py-1.5 text-xs text-red-200">
						Detector facial no disponible: {detector.error.message}
					</div>
				)}

				{/* Detector loading */}
				{!detector.ready && !detector.error && camera.state === "ready" && (
					<div className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md bg-zinc-950/85 px-3 py-1.5 text-xs text-zinc-200">
						<Spinner size="sm" />
						<span>Cargando modelo facial…</span>
					</div>
				)}

				{/* Debug HUD: live pose values (turn off later) */}
				{detector.ready && debug && (
					<div className="absolute bottom-2 left-2 z-30 rounded bg-zinc-950/80 px-2 py-1 font-mono text-[10px] leading-tight text-zinc-200">
						<div>yaw: {debug.yaw.toFixed(1)}°</div>
						<div>pitch: {debug.pitch.toFixed(1)}°</div>
						<div>roll: {debug.roll.toFixed(1)}°</div>
						<div>faces: {debug.faceCount}</div>
					</div>
				)}
			</div>

			{/* Step indicators */}
			<div className="flex items-center justify-center gap-3">
				{(["front", "right", "left"] as CaptureStep[]).map((s) => {
					const done = state.completed.includes(s);
					const active = state.step === s && !done;
					return (
						<div
							key={s}
							className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
								done
									? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
									: active
										? "border-zinc-600 bg-zinc-800 text-zinc-100"
										: "border-zinc-800 bg-zinc-900/50 text-zinc-500"
							}`}
						>
							{done ? <CheckCircle size={12} /> : <User size={12} />}
							{STEP_LABEL[s]}
						</div>
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
