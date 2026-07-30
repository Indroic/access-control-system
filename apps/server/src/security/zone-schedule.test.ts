import {
	isWithinSchedule,
	type ZoneSchedule,
} from "@access-control-system/api/services/zone-schedule";
import { describe, expect, it } from "vitest";

/** Zona diurna típica: 08:00–18:00, lunes a viernes, hora de Caracas (UTC-4). */
function dayShift(overrides: Partial<ZoneSchedule> = {}): ZoneSchedule {
	return {
		restricted: true,
		active: true,
		allowedFromMinute: 8 * 60,
		allowedToMinute: 18 * 60,
		allowedDays: [1, 2, 3, 4, 5],
		timezone: "America/Caracas",
		...overrides,
	};
}

/** Turno nocturno que cruza medianoche: 22:00–06:00. */
function nightShift(overrides: Partial<ZoneSchedule> = {}): ZoneSchedule {
	return dayShift({
		allowedFromMinute: 22 * 60,
		allowedToMinute: 6 * 60,
		...overrides,
	});
}

// 2026-07-30 es jueves; Caracas va 4 h detrás de UTC.
const thursdayNoonUtc = new Date("2026-07-30T16:00:00Z"); // jueves 12:00 local
const thursdayDawnUtc = new Date("2026-07-30T07:00:00Z"); // jueves 03:00 local

describe("isWithinSchedule — turno diurno", () => {
	it("permite el acceso dentro de la ventana en un día habilitado", () => {
		const verdict = isWithinSchedule(dayShift(), thursdayNoonUtc);
		expect(verdict.allowed).toBe(true);
		expect(verdict.reason).toBe("allowed");
		expect(verdict.localTime).toBe("12:00");
		expect(verdict.localWeekday).toBe(4);
	});

	it("rechaza la madrugada como fuera de horario", () => {
		const verdict = isWithinSchedule(dayShift(), thursdayDawnUtc);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toBe("outside_hours");
		expect(verdict.localTime).toBe("03:00");
	});

	it("rechaza el límite superior de la ventana (18:00 ya es fuera)", () => {
		// jueves 18:00 local = 22:00 UTC
		const verdict = isWithinSchedule(
			dayShift(),
			new Date("2026-07-30T22:00:00Z"),
		);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toBe("outside_hours");
	});

	it("acepta el límite inferior de la ventana (08:00 es dentro)", () => {
		const verdict = isWithinSchedule(
			dayShift(),
			new Date("2026-07-30T12:00:00Z"),
		);
		expect(verdict.allowed).toBe(true);
	});

	it("rechaza una hora válida en un día no habilitado", () => {
		const verdict = isWithinSchedule(
			dayShift({ allowedDays: [1, 2, 3] }),
			thursdayNoonUtc,
		);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toBe("day_not_allowed");
	});
});

describe("isWithinSchedule — turno nocturno que cruza medianoche", () => {
	it("permite el tramo previo a medianoche del día habilitado", () => {
		// jueves 23:00 local = viernes 03:00 UTC
		const verdict = isWithinSchedule(
			nightShift({ allowedDays: [4] }),
			new Date("2026-07-31T03:00:00Z"),
		);
		expect(verdict.allowed).toBe(true);
		expect(verdict.localTime).toBe("23:00");
	});

	it("permite el tramo posterior a medianoche imputándolo al día en que inició el turno", () => {
		// viernes 02:00 local = viernes 06:00 UTC; el turno arrancó el jueves.
		const verdict = isWithinSchedule(
			nightShift({ allowedDays: [4] }),
			new Date("2026-07-31T06:00:00Z"),
		);
		expect(verdict.allowed).toBe(true);
		expect(verdict.localWeekday).toBe(5);
	});

	it("rechaza la madrugada si el turno del día anterior no estaba habilitado", () => {
		const verdict = isWithinSchedule(
			nightShift({ allowedDays: [5] }),
			new Date("2026-07-31T06:00:00Z"),
		);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toBe("day_not_allowed");
	});

	it("rechaza una hora intermedia fuera de ambos tramos", () => {
		// jueves 12:00 local no cae ni en [22:00,24:00) ni en [00:00,06:00)
		const verdict = isWithinSchedule(nightShift(), thursdayNoonUtc);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toBe("outside_hours");
	});
});

describe("isWithinSchedule — casos de configuración", () => {
	it("no restringe las zonas de libre tránsito", () => {
		const verdict = isWithinSchedule(
			dayShift({ restricted: false }),
			thursdayDawnUtc,
		);
		expect(verdict.allowed).toBe(true);
		expect(verdict.reason).toBe("unrestricted");
	});

	it("marca como incidente el acceso a una zona fuera de servicio", () => {
		const verdict = isWithinSchedule(
			dayShift({ active: false }),
			thursdayNoonUtc,
		);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toBe("zone_inactive");
	});

	it("trata una ventana de extremos iguales como cobertura de 24 h", () => {
		const zone = dayShift({ allowedFromMinute: 0, allowedToMinute: 0 });
		expect(isWithinSchedule(zone, thursdayDawnUtc).allowed).toBe(true);
		expect(isWithinSchedule(zone, thursdayNoonUtc).allowed).toBe(true);
	});

	it("respeta el huso horario de la zona", () => {
		// El mismo instante es jueves 12:00 en Caracas y jueves 16:00 en UTC:
		// dentro de la ventana en ambos casos, pero con hora local distinta.
		expect(isWithinSchedule(dayShift(), thursdayNoonUtc).localTime).toBe(
			"12:00",
		);
		expect(
			isWithinSchedule(dayShift({ timezone: "UTC" }), thursdayNoonUtc)
				.localTime,
		).toBe("16:00");
	});

	it("degrada a UTC ante un huso inválido en vez de fallar", () => {
		const verdict = isWithinSchedule(
			dayShift({ timezone: "Marte/Olympus_Mons" }),
			thursdayNoonUtc,
		);
		expect(verdict.localTime).toBe("16:00");
		expect(verdict.allowed).toBe(true);
	});

	it("expone la ventana permitida en formato legible para el reporte", () => {
		expect(isWithinSchedule(dayShift(), thursdayNoonUtc).windowLabel).toBe(
			"08:00–18:00",
		);
	});
});
