import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
	| "idle"
	| "requesting"
	| "ready"
	| "denied"
	| "unavailable"
	| "insecure"
	| "error";

export type CaptureResult = { imageBase64: string; mimeType: "image/jpeg" };

export type UseCameraOptions = {
	facingMode?: "user" | "environment";
	deviceId?: string;
	width?: number;
	height?: number;
	autoStart?: boolean;
};

export type UseCameraReturn = {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	state: CameraState;
	error: Error | null;
	start: () => Promise<void>;
	stop: () => void;
	capture: (quality?: number) => CaptureResult | null;
	devices: MediaDeviceInfo[];
	currentDeviceId: string | undefined;
	switchDevice: (deviceId: string) => Promise<void>;
};

function mapError(err: unknown): CameraState {
	if (!(err instanceof Error)) return "error";
	switch (err.name) {
		case "NotAllowedError":
		case "SecurityError":
			return "denied";
		case "NotFoundError":
		case "OverconstrainedError":
		case "ConstraintNotSatisfiedError":
			return "unavailable";
		case "NotReadableError":
		case "AbortError":
			return "error";
		default:
			return "error";
	}
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
	const {
		facingMode = "user",
		deviceId,
		width,
		height,
		autoStart = false,
	} = options;

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [state, setState] = useState<CameraState>("idle");
	const [error, setError] = useState<Error | null>(null);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>(
		deviceId,
	);

	const stop = useCallback(() => {
		const stream = streamRef.current;
		if (stream) {
			for (const track of stream.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}
		if (videoRef.current) {
			videoRef.current.srcObject = null;
		}
		setState("idle");
	}, []);

	const startWithConstraints = useCallback(
		async (constraints: MediaStreamConstraints) => {
			if (typeof window === "undefined") return;
			if (!window.isSecureContext) {
				setState("insecure");
				setError(new Error("Camera requires HTTPS or localhost"));
				return;
			}
			if (!navigator.mediaDevices?.getUserMedia) {
				setState("insecure");
				setError(new Error("mediaDevices API not available"));
				return;
			}

			setState("requesting");
			setError(null);

			try {
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				// Stop any prior stream before swapping in the new one.
				const prev = streamRef.current;
				if (prev) {
					for (const track of prev.getTracks()) track.stop();
				}
				streamRef.current = stream;

				const video = videoRef.current;
				if (video) {
					video.srcObject = stream;
					await new Promise<void>((resolve) => {
						if (video.readyState >= 1) {
							resolve();
							return;
						}
						const onMeta = () => {
							video.removeEventListener("loadedmetadata", onMeta);
							resolve();
						};
						video.addEventListener("loadedmetadata", onMeta);
					});
					try {
						await video.play();
					} catch {
						// Autoplay can reject without a gesture; preview still works.
					}
				}

				const active = stream.getVideoTracks()[0];
				const settings = active?.getSettings();
				if (settings?.deviceId) setCurrentDeviceId(settings.deviceId);

				try {
					const list = await navigator.mediaDevices.enumerateDevices();
					setDevices(list.filter((d) => d.kind === "videoinput"));
				} catch {
					// Non-fatal: device list optional.
				}

				setState("ready");
			} catch (err) {
				setState(mapError(err));
				setError(err instanceof Error ? err : new Error(String(err)));
			}
		},
		[],
	);

	const start = useCallback(async () => {
		const video: MediaTrackConstraints = {};
		if (currentDeviceId) {
			video.deviceId = { exact: currentDeviceId };
		} else {
			video.facingMode = facingMode;
		}
		if (width) video.width = { ideal: width };
		if (height) video.height = { ideal: height };
		await startWithConstraints({ video, audio: false });
	}, [currentDeviceId, facingMode, width, height, startWithConstraints]);

	const switchDevice = useCallback(
		async (id: string) => {
			setCurrentDeviceId(id);
			const video: MediaTrackConstraints = { deviceId: { exact: id } };
			if (width) video.width = { ideal: width };
			if (height) video.height = { ideal: height };
			await startWithConstraints({ video, audio: false });
		},
		[height, width, startWithConstraints],
	);

	const capture = useCallback((quality = 0.92): CaptureResult | null => {
		const video = videoRef.current;
		if (!video || video.readyState < 2) return null;

		const w = video.videoWidth;
		const h = video.videoHeight;
		if (!w || !h) return null;

		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0, w, h);

		const dataUrl = canvas.toDataURL("image/jpeg", quality);
		const imageBase64 = dataUrl.split(",", 2)[1] ?? "";
		return { imageBase64, mimeType: "image/jpeg" };
	}, []);

	useEffect(() => {
		if (autoStart) {
			void start();
		}
		return () => {
			const stream = streamRef.current;
			if (stream) {
				for (const track of stream.getTracks()) track.stop();
				streamRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		videoRef,
		state,
		error,
		start,
		stop,
		capture,
		devices,
		currentDeviceId,
		switchDevice,
	};
}
