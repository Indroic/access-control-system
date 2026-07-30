/**
 * Evaluación de horarios de zona — lógica pura, sin acceso a base de datos.
 *
 * El horario de cada zona se define en minutos desde la medianoche en la hora
 * local de la propia zona (`timezone`), no en la del servidor: un mismo
 * despliegue puede vigilar sedes en husos distintos.
 */

export type ZoneSchedule = {
	restricted: boolean;
	active: boolean;
	allowedFromMinute: number;
	allowedToMinute: number;
	/** 0 = domingo … 6 = sábado. */
	allowedDays: number[];
	timezone: string;
};

export type ScheduleReason =
	| "allowed"
	| "unrestricted"
	| "zone_inactive"
	| "day_not_allowed"
	| "outside_hours";

export type ScheduleVerdict = {
	allowed: boolean;
	reason: ScheduleReason;
	/** Minutos desde medianoche en la hora local de la zona. */
	localMinutes: number;
	/** Día de la semana local, 0 = domingo. */
	localWeekday: number;
	/** Hora local formateada `HH:MM`. */
	localTime: string;
	/** Ventana permitida formateada, p. ej. `08:00–18:00`. */
	windowLabel: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

export const WEEKDAY_LABELS = [
	"Domingo",
	"Lunes",
	"Martes",
	"Miércoles",
	"Jueves",
	"Viernes",
	"Sábado",
] as const;

/** `540` → `"09:00"`. Acepta valores fuera de rango normalizándolos. */
export function formatMinutes(minute: number): string {
	const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
	const hours = Math.floor(normalized / 60);
	const mins = normalized % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Descompone un instante en día de la semana y minutos locales de un huso. */
export function zonedParts(at: Date, timeZone: string) {
	let parts: Intl.DateTimeFormatPart[];
	try {
		parts = new Intl.DateTimeFormat("en-US", {
			timeZone,
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).formatToParts(at);
	} catch {
		// Huso inválido en la configuración de la zona: se degrada a UTC en vez
		// de tumbar la evaluación de acceso.
		parts = new Intl.DateTimeFormat("en-US", {
			timeZone: "UTC",
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).formatToParts(at);
	}

	const lookup = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "";

	const weekday = WEEKDAY_INDEX[lookup("weekday")] ?? at.getUTCDay();
	const hour = Number.parseInt(lookup("hour"), 10) % 24;
	const minute = Number.parseInt(lookup("minute"), 10);

	return {
		weekday,
		minutes:
			(Number.isNaN(hour) ? 0 : hour) * 60 +
			(Number.isNaN(minute) ? 0 : minute),
	};
}

/**
 * Determina si un acceso ocurre dentro del horario permitido de la zona.
 *
 * Ventanas nocturnas (`allowedFromMinute > allowedToMinute`) se tratan como un
 * turno que cruza la medianoche: un evento después de medianoche se valida
 * contra el día en que comenzó el turno, es decir el día anterior.
 */
export function isWithinSchedule(
	zone: ZoneSchedule,
	at: Date = new Date(),
): ScheduleVerdict {
	const { weekday, minutes } = zonedParts(at, zone.timezone);
	const base = {
		localMinutes: minutes,
		localWeekday: weekday,
		localTime: formatMinutes(minutes),
		windowLabel: `${formatMinutes(zone.allowedFromMinute)}–${formatMinutes(
			zone.allowedToMinute,
		)}`,
	};

	if (!zone.active) {
		return { ...base, allowed: false, reason: "zone_inactive" };
	}
	if (!zone.restricted) {
		return { ...base, allowed: true, reason: "unrestricted" };
	}

	const from = zone.allowedFromMinute;
	const to = zone.allowedToMinute;
	const days = zone.allowedDays ?? [];

	// Ventana de 24 h: solo importa el día.
	if (from === to) {
		return days.includes(weekday)
			? { ...base, allowed: true, reason: "allowed" }
			: { ...base, allowed: false, reason: "day_not_allowed" };
	}

	if (from < to) {
		if (minutes < from || minutes >= to) {
			return { ...base, allowed: false, reason: "outside_hours" };
		}
		return days.includes(weekday)
			? { ...base, allowed: true, reason: "allowed" }
			: { ...base, allowed: false, reason: "day_not_allowed" };
	}

	// Turno nocturno: [from, 24:00) del día D  ∪  [00:00, to) del día D+1.
	if (minutes >= from) {
		return days.includes(weekday)
			? { ...base, allowed: true, reason: "allowed" }
			: { ...base, allowed: false, reason: "day_not_allowed" };
	}
	if (minutes < to) {
		const shiftStartDay = (weekday + 6) % 7;
		return days.includes(shiftStartDay)
			? { ...base, allowed: true, reason: "allowed" }
			: { ...base, allowed: false, reason: "day_not_allowed" };
	}

	return { ...base, allowed: false, reason: "outside_hours" };
}

/** Texto legible para el campo "explicación del incidente" del reporte. */
export function describeVerdict(
	verdict: ScheduleVerdict,
	zoneName: string,
	personLabel: string,
): string {
	const day = WEEKDAY_LABELS[verdict.localWeekday] ?? "—";
	switch (verdict.reason) {
		case "zone_inactive":
			return `${personLabel} intentó acceder a la zona «${zoneName}», que se encuentra fuera de servicio (desactivada). Registro a las ${verdict.localTime} del ${day}.`;
		case "day_not_allowed":
			return `${personLabel} accedió a la zona restringida «${zoneName}» un ${day}, día no habilitado en el calendario de la zona. Hora local del evento: ${verdict.localTime}.`;
		case "outside_hours":
			return `${personLabel} accedió a la zona restringida «${zoneName}» a las ${verdict.localTime} (${day}), fuera del horario permitido ${verdict.windowLabel}.`;
		default:
			return `Acceso de ${personLabel} a la zona «${zoneName}» a las ${verdict.localTime} (${day}), dentro del horario permitido ${verdict.windowLabel}.`;
	}
}

/** Mapea el motivo del rechazo al tipo de incidente que se persiste. */
export function incidentTypeForReason(
	reason: ScheduleReason,
): "off_hours_access" | "restricted_day_access" | "inactive_zone_access" {
	switch (reason) {
		case "zone_inactive":
			return "inactive_zone_access";
		case "day_not_allowed":
			return "restricted_day_access";
		default:
			return "off_hours_access";
	}
}
