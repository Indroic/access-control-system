import { useCallback, useRef, useState } from "react";
import type { CaptureResult } from "#/hooks/use-camera";
import type { PoseDetection } from "#/hooks/use-pose-detector";

export type CaptureStep = "front" | "right" | "left";

export const CAPTURE_STEPS: CaptureStep[] = ["front", "right", "left"];

export type PoseTarget = {
	yaw: number;
	yawTol: number;
	pitchTol: number;
	rollTol: number;
};

export const POSE_TARGETS: Record<CaptureStep, PoseTarget> = {
	front: { yaw: 0, yawTol: 14, pitchTol: 15, rollTol: 15 },
	right: { yaw: 20, yawTol: 14, pitchTol: 20, rollTol: 20 },
	left: { yaw: -20, yawTol: 14, pitchTol: 20, rollTol: 20 },
};

export const FRAME_SIZE_MIN = 0.25;
export const FRAME_SIZE_MAX = 0.6;
export const FRAME_CENTER_TOLERANCE = 0.2;
export const HOLD_DURATION_MS = 500;

export type AlignmentIssue =
	| "no-face"
	| "multiple-faces"
	| "too-far"
	| "too-close"
	| "off-center"
	| "wrong-angle"
	| "ok";

export type FlowPhase =
	| "aligning"
	| "holding"
	| "captured-step"
	| "uploading"
	| "done"
	| "error";

export type FlowState = {
	phase: FlowPhase;
	step: CaptureStep;
	completed: CaptureStep[];
	issue: AlignmentIssue;
	holdProgress: number;
	error: string | null;
};

export type UseFaceCaptureFlowOptions = {
	capture: () => CaptureResult | null;
	onComplete: (frames: Record<CaptureStep, CaptureResult>) => Promise<void>;
};

function classifyAlignment(
	det: PoseDetection,
	target: PoseTarget,
): AlignmentIssue {
	if (det.faceCount === 0 || !det.bbox) return "no-face";
	if (det.faceCount > 1) return "multiple-faces";

	const bboxHeight = det.bbox.maxY - det.bbox.minY;
	if (bboxHeight < FRAME_SIZE_MIN) return "too-far";
	if (bboxHeight > FRAME_SIZE_MAX) return "too-close";

	const cx = (det.bbox.minX + det.bbox.maxX) / 2;
	const cy = (det.bbox.minY + det.bbox.maxY) / 2;
	if (
		Math.abs(cx - 0.5) > FRAME_CENTER_TOLERANCE ||
		Math.abs(cy - 0.5) > FRAME_CENTER_TOLERANCE
	)
		return "off-center";

	if (
		Math.abs(det.yaw - target.yaw) > target.yawTol ||
		Math.abs(det.pitch) > target.pitchTol ||
		Math.abs(det.roll) > target.rollTol
	)
		return "wrong-angle";

	return "ok";
}

export function useFaceCaptureFlow({
	capture,
	onComplete,
}: UseFaceCaptureFlowOptions) {
	const [state, setState] = useState<FlowState>({
		phase: "aligning",
		step: "front",
		completed: [],
		issue: "no-face",
		holdProgress: 0,
		error: null,
	});

	const stepRef = useRef<CaptureStep>("front");
	const completedRef = useRef<CaptureStep[]>([]);
	const holdSinceRef = useRef<number | null>(null);
	const framesRef = useRef<Partial<Record<CaptureStep, CaptureResult>>>({});
	const lockedRef = useRef(false);
	const finishingRef = useRef(false);
	const terminalRef = useRef(false);

	const reset = useCallback(() => {
		stepRef.current = "front";
		completedRef.current = [];
		holdSinceRef.current = null;
		framesRef.current = {};
		lockedRef.current = false;
		finishingRef.current = false;
		terminalRef.current = false;
		setState({
			phase: "aligning",
			step: "front",
			completed: [],
			issue: "no-face",
			holdProgress: 0,
			error: null,
		});
	}, []);

	const advanceOrFinish = useCallback(async () => {
		const current = stepRef.current;
		const idx = CAPTURE_STEPS.indexOf(current);
		const next = CAPTURE_STEPS[idx + 1];
		const newCompleted = [...completedRef.current, current];
		completedRef.current = newCompleted;
		holdSinceRef.current = null;

		if (!next) {
			terminalRef.current = true;
			finishingRef.current = true;
			lockedRef.current = true;
			setState((s) => ({
				...s,
				phase: "uploading",
				completed: newCompleted,
				holdProgress: 1,
			}));
			try {
				await onComplete(
					framesRef.current as Record<CaptureStep, CaptureResult>,
				);
				setState((s) => ({ ...s, phase: "done" }));
			} catch (err) {
				setState((s) => ({
					...s,
					phase: "error",
					error: err instanceof Error ? err.message : String(err),
				}));
			} finally {
				finishingRef.current = false;
			}
			return;
		}

		stepRef.current = next;
		setState({
			phase: "aligning",
			step: next,
			completed: newCompleted,
			issue: "no-face",
			holdProgress: 0,
			error: null,
		});
		// Brief lock so the user has a chance to start turning before we evaluate again.
		setTimeout(() => {
			lockedRef.current = false;
		}, 400);
	}, [onComplete]);

	const handleDetection = useCallback(
		(det: PoseDetection) => {
			if (terminalRef.current || lockedRef.current || finishingRef.current)
				return;

			const step = stepRef.current;
			const target = POSE_TARGETS[step];
			const issue = classifyAlignment(det, target);

			if (issue !== "ok") {
				holdSinceRef.current = null;
				setState((s) => {
					if (
						s.phase === "aligning" &&
						s.issue === issue &&
						s.holdProgress === 0
					) {
						return s;
					}
					return { ...s, phase: "aligning", issue, holdProgress: 0 };
				});
				return;
			}

			const now = performance.now();
			if (holdSinceRef.current === null) {
				holdSinceRef.current = now;
			}
			const elapsed = now - holdSinceRef.current;
			const progress = Math.min(1, elapsed / HOLD_DURATION_MS);

			if (progress >= 1) {
				lockedRef.current = true;
				const frame = capture();
				if (!frame) {
					holdSinceRef.current = null;
					lockedRef.current = false;
					return;
				}
				framesRef.current[step] = frame;
				setState((s) => ({
					...s,
					phase: "captured-step",
					issue: "ok",
					holdProgress: 1,
				}));
				void advanceOrFinish();
				return;
			}

			setState((s) => ({
				...s,
				phase: "holding",
				issue: "ok",
				holdProgress: progress,
			}));
		},
		[advanceOrFinish, capture],
	);

	return { state, handleDetection, reset };
}
