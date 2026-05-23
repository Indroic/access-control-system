import { useEffect, useRef, useState } from "react";
import type {
	FaceLandmarker,
	FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type PoseDetection = {
	yaw: number;
	pitch: number;
	roll: number;
	faceCount: number;
	bbox: { minX: number; maxX: number; minY: number; maxY: number } | null;
};

export type UsePoseDetectorOptions = {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	enabled: boolean;
	onDetection?: (det: PoseDetection) => void;
	mirrored?: boolean;
};

const WASM_BASE =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL = "/models/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
	if (!landmarkerPromise) {
		landmarkerPromise = (async () => {
			const vision = await import("@mediapipe/tasks-vision");
			const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
			return vision.FaceLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
				runningMode: "VIDEO",
				numFaces: 1,
				outputFacialTransformationMatrixes: true,
				outputFaceBlendshapes: false,
			});
		})().catch((err) => {
			landmarkerPromise = null;
			throw err;
		});
	}
	return landmarkerPromise;
}

// Derive yaw / pitch / roll (degrees) from MediaPipe's facialTransformationMatrixes.
// MediaPipe returns a 4x4 column-major matrix; the rotation part is the top-left 3x3.
// We decompose as R = Ry(yaw) * Rx(pitch) * Rz(roll), so:
//   m[8]  =  sin(yaw) * cos(pitch)
//   m[9]  = -sin(pitch)
//   m[10] =  cos(yaw) * cos(pitch)
//   m[1]  =  cos(pitch) * sin(roll)
//   m[5]  =  cos(pitch) * cos(roll)
function matrixToEuler(m: Float32Array): { yaw: number; pitch: number; roll: number } {
	const m1 = m[1]!;
	const m5 = m[5]!;
	const m8 = m[8]!;
	const m9 = m[9]!;
	const m10 = m[10]!;

	const pitch = Math.asin(Math.max(-1, Math.min(1, -m9)));
	let yaw: number;
	let roll: number;
	if (Math.abs(m9) < 0.99999) {
		yaw = Math.atan2(m8, m10);
		roll = Math.atan2(m1, m5);
	} else {
		// Gimbal lock at |pitch| ≈ 90°.
		yaw = Math.atan2(-m[2]!, m[0]!);
		roll = 0;
	}
	const RAD = 180 / Math.PI;
	return { yaw: yaw * RAD, pitch: pitch * RAD, roll: roll * RAD };
}

export function usePoseDetector({
	videoRef,
	enabled,
	onDetection,
	mirrored = true,
}: UsePoseDetectorOptions) {
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const onDetectionRef = useRef(onDetection);
	onDetectionRef.current = onDetection;

	useEffect(() => {
		if (!enabled) return;

		let cancelled = false;
		let rafId: number | null = null;
		let landmarker: FaceLandmarker | null = null;
		let lastTimestamp = -1;

		const tick = () => {
			if (cancelled) return;
			const video = videoRef.current;
			if (!video || video.readyState < 2 || !landmarker) {
				rafId = requestAnimationFrame(tick);
				return;
			}

			// MediaPipe requires strictly increasing timestamps in VIDEO mode.
			const ts = performance.now();
			if (ts <= lastTimestamp) {
				rafId = requestAnimationFrame(tick);
				return;
			}
			lastTimestamp = ts;

			let result: FaceLandmarkerResult | null = null;
			try {
				result = landmarker.detectForVideo(video, ts);
			} catch {
				// Single bad frame — skip and continue.
				rafId = requestAnimationFrame(tick);
				return;
			}

			const matrices = result.facialTransformationMatrixes ?? [];
			const landmarks = result.faceLandmarks ?? [];

			if (matrices.length === 0 || landmarks.length === 0) {
				onDetectionRef.current?.({
					yaw: 0,
					pitch: 0,
					roll: 0,
					faceCount: 0,
					bbox: null,
				});
			} else {
				const matrix = matrices[0]!.data as Float32Array;
				const euler = matrixToEuler(matrix);
				const pts = landmarks[0]!;
				let minX = 1;
				let maxX = 0;
				let minY = 1;
				let maxY = 0;
				for (const p of pts) {
					if (p.x < minX) minX = p.x;
					if (p.x > maxX) maxX = p.x;
					if (p.y < minY) minY = p.y;
					if (p.y > maxY) maxY = p.y;
				}
				// If the video preview is mirrored, the user's actual head rotation
				// is the opposite of what the model sees through the flipped frame.
				const yaw = mirrored ? -euler.yaw : euler.yaw;
				const roll = mirrored ? -euler.roll : euler.roll;
				onDetectionRef.current?.({
					yaw,
					pitch: euler.pitch,
					roll,
					faceCount: matrices.length,
					bbox: { minX, maxX, minY, maxY },
				});
			}

			rafId = requestAnimationFrame(tick);
		};

		(async () => {
			try {
				landmarker = await getLandmarker();
				if (cancelled) return;
				setReady(true);
				rafId = requestAnimationFrame(tick);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err : new Error(String(err)));
			}
		})();

		return () => {
			cancelled = true;
			if (rafId !== null) cancelAnimationFrame(rafId);
			// Note: we intentionally do NOT close the shared landmarker — it's reused
			// across mount/unmount cycles via the module-level promise.
		};
	}, [enabled, videoRef, mirrored]);

	return { ready, error };
}
