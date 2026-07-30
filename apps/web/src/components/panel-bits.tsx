import { Input, Label, TextField } from "@heroui/react";
import { RefreshCw, Search } from "lucide-react";

/** Iniciales para el avatar de una persona. */
export function initials(name?: string | null) {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

export type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

/** Traduce una acción de la bitácora a etiqueta y color. */
export function actionTag(action: string): { color: ChipColor; label: string } {
	switch (action) {
		case "biometric_match_success":
		case "biometric_access_granted":
			return { color: "success", label: "Coincidencia" };
		case "biometric_match_failed":
		case "biometric_access_denied":
			return { color: "danger", label: "Sin coincidencia" };
		case "biometrics_registered":
			return { color: "accent", label: "Enrolado" };
		case "biometric_suspicious_login":
			return { color: "warning", label: "Ingreso inusual" };
		case "door_opened":
			return { color: "success", label: "Puerta abierta" };
		case "door_open_failed":
			return { color: "warning", label: "Apertura fallida" };
		case "login_success":
			return { color: "success", label: "Sesión iniciada" };
		case "login_failed":
			return { color: "danger", label: "Sesión rechazada" };
		case "user_created":
			return { color: "accent", label: "Usuario creado" };
		case "user_updated":
			return { color: "default", label: "Usuario actualizado" };
		case "user_deleted":
			return { color: "danger", label: "Usuario eliminado" };
		default:
			return { color: "default", label: action };
	}
}

export function Readout({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: number | string;
	tone?: "default" | "accent" | "grant" | "deny" | "pending";
}) {
	const color =
		tone === "accent"
			? "text-accent"
			: tone === "grant"
				? "text-success"
				: tone === "deny"
					? "text-danger"
					: tone === "pending"
						? "text-warning"
						: "text-foreground";
	return (
		<div className="px-2 sm:px-4">
			<div className="telemetry">{label}</div>
			<div className={`readout mt-1.5 font-semibold text-2xl ${color}`}>
				{value}
			</div>
		</div>
	);
}

export function LoadingRow() {
	return (
		<div className="flex items-center justify-center py-24 text-muted">
			<RefreshCw className="animate-spin" size={28} />
		</div>
	);
}

export function EmptyState({
	title,
	body,
	icon,
}: {
	title: string;
	body: string;
	icon?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
			{icon ?? <Search size={22} className="text-muted" />}
			<p className="font-display font-semibold text-[15px] text-foreground">
				{title}
			</p>
			<p className="max-w-sm text-muted text-sm">{body}</p>
		</div>
	);
}

export function Field({
	name,
	label,
	value,
	onChange,
	placeholder,
	type,
	isRequired = true,
}: {
	name: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
	isRequired?: boolean;
}) {
	return (
		<TextField
			name={name}
			type={type}
			value={value}
			onChange={onChange}
			isRequired={isRequired}
		>
			<Label className="telemetry mb-1.5 block">{label}</Label>
			<Input placeholder={placeholder} variant="secondary" />
		</TextField>
	);
}

/* ── Formato de fechas ───────────────────────────────────────────────────── */

export function formatDateTime(value: string | Date | null | undefined) {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleString("es-ES", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export function formatDateOnly(value: string | Date | null | undefined) {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleDateString("es-ES", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

export function formatTimeOnly(value: string | Date | null | undefined) {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleTimeString("es-ES", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
