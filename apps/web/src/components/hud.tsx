/*
 * TERMOGRAFÍA — non-component visuals only (see /DESIGN.md).
 * The target/face mark, the reticle frame, telemetry rows, and the thermal
 * legend. Everything structural (cards, tabs, tables, chips…) is HeroUI.
 */

/* The mark: a face acquired inside a targeting reticle. */
export function AccessMark({
	size = 24,
	className = "",
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M3 7.5 V3.8 A0.8 0.8 0 0 1 3.8 3 H7.5" />
			<path d="M16.5 3 H20.2 A0.8 0.8 0 0 1 21 3.8 V7.5" />
			<path d="M21 16.5 V20.2 A0.8 0.8 0 0 1 20.2 21 H16.5" />
			<path d="M7.5 21 H3.8 A0.8 0.8 0 0 1 3 20.2 V16.5" />
			<circle cx="12" cy="12" r="4.1" strokeWidth="1.4" />
			<path d="M12 4.2 V6.1" />
			<path d="M12 17.9 V19.8" />
			<path d="M4.2 12 H6.1" />
			<path d="M17.9 12 H19.8" />
		</svg>
	);
}

/* Brand lockup: mark + wordmark. */
export function Brandmark({
	className = "",
	sub = "Termografía de acceso",
}: {
	className?: string;
	sub?: string;
}) {
	return (
		<div className={`flex items-center gap-2.5 ${className}`}>
			<span className="text-accent">
				<AccessMark size={26} />
			</span>
			<span className="leading-none">
				<span className="block font-bold font-display text-[15px] text-foreground tracking-tight">
					Control de Acceso Facial
				</span>
				<span className="telemetry mt-1 block">{sub}</span>
			</span>
		</div>
	);
}

/* Target reticle overlay — drop inside a `position: relative` parent. */
export function Reticle({
	tone = "idle",
	className = "",
}: {
	tone?: "idle" | "plain" | "grant" | "deny";
	className?: string;
}) {
	const mod =
		tone === "idle"
			? "reticle--idle"
			: tone === "grant"
				? "reticle--grant"
				: tone === "deny"
					? "reticle--deny"
					: "";
	return (
		<div className={`reticle ${mod} ${className}`} aria-hidden="true">
			<span />
			<span />
			<span />
			<span />
		</div>
	);
}

/* A telemetry readout line: LABEL → value (mono). */
export function TelemetryRow({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: React.ReactNode;
	tone?: "default" | "accent" | "grant" | "deny" | "pending";
}) {
	const valueColor =
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
		<div className="flex items-center justify-between gap-3 border-separator border-b py-1.5 last:border-b-0">
			<span className="telemetry">{label}</span>
			<span className={`readout text-xs ${valueColor}`}>{value}</span>
		</div>
	);
}

/* A thin cold→hot thermal legend bar. */
export function ThermalLegend({ className = "" }: { className?: string }) {
	return <div className={`thermal-legend ${className}`} aria-hidden="true" />;
}
