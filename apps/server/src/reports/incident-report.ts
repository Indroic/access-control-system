import { Buffer } from "node:buffer";

import type { IncidentRow } from "@access-control-system/api/services/incidents";
import {
	INCIDENT_SEVERITY_LABELS,
	INCIDENT_STATUS_LABELS,
	INCIDENT_TYPE_LABELS,
} from "@access-control-system/api/services/incidents";
import ExcelJS from "exceljs";

import { PdfDocument, type RGB } from "./pdf";

export type ReportFilterSummary = {
	label: string;
	value: string;
}[];

export type ReportMeta = {
	generatedAt: Date;
	generatedBy: string;
	timeZone: string;
	filters: ReportFilterSummary;
	stats: {
		total: number;
		open: number;
		critical: number;
		high: number;
		resolved: number;
	};
};

const REPORT_TITLE = "Reporte de Incidentes de Seguridad";
const REPORT_SUBTITLE =
	"Sistema de Control de Acceso Facial · Documento de auditoría";

/* ── Formato de fechas ───────────────────────────────────────────────────── */

function parts(date: Date, timeZone: string) {
	let formatted: Intl.DateTimeFormatPart[];
	const options: Intl.DateTimeFormatOptions = {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	};
	try {
		formatted = new Intl.DateTimeFormat("es-ES", options).formatToParts(date);
	} catch {
		formatted = new Intl.DateTimeFormat("es-ES", {
			...options,
			timeZone: "UTC",
		}).formatToParts(date);
	}
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		formatted.find((p) => p.type === type)?.value ?? "";
	return {
		day: get("day"),
		month: get("month"),
		year: get("year"),
		hour: get("hour"),
		minute: get("minute"),
		second: get("second"),
	};
}

/** `31/07/2026` — día, mes y año exactos del evento. */
export function formatDate(date: Date, timeZone: string): string {
	const p = parts(date, timeZone);
	return `${p.day}/${p.month}/${p.year}`;
}

/** `14:35` — hora y minutos de la detección. */
export function formatTime(date: Date, timeZone: string): string {
	const p = parts(date, timeZone);
	return `${p.hour}:${p.minute}`;
}

export function formatDateTime(date: Date, timeZone: string): string {
	const p = parts(date, timeZone);
	return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

function label(map: Record<string, string>, key: string): string {
	return map[key] ?? key;
}

/* ── Exportación XLSX ────────────────────────────────────────────────────── */

const HEADER_FILL = "FF1F2933";
const SEVERITY_FILL: Record<string, string> = {
	critical: "FFF8D7DA",
	high: "FFFCE8D5",
	medium: "FFFFF6D6",
	low: "FFE8F3EC",
};

export async function buildIncidentWorkbook(
	rows: IncidentRow[],
	meta: ReportMeta,
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Control de Acceso Facial";
	workbook.created = meta.generatedAt;

	/* Hoja 1 — portada con criterios aplicados y totales. */
	const summary = workbook.addWorksheet("Resumen");
	summary.columns = [{ width: 32 }, { width: 62 }];

	summary.addRow([REPORT_TITLE]).font = { size: 15, bold: true };
	summary.addRow([REPORT_SUBTITLE]).font = { size: 10, italic: true };
	summary.addRow([]);
	summary.addRow([
		"Generado el",
		formatDateTime(meta.generatedAt, meta.timeZone),
	]);
	summary.addRow(["Generado por", meta.generatedBy]);
	summary.addRow(["Huso horario del reporte", meta.timeZone]);
	summary.addRow([]);

	const criteriaHeader = summary.addRow(["Criterios de filtrado", ""]);
	criteriaHeader.font = { bold: true };
	for (const filter of meta.filters) {
		summary.addRow([filter.label, filter.value]);
	}
	summary.addRow([]);

	const totalsHeader = summary.addRow(["Totales", ""]);
	totalsHeader.font = { bold: true };
	summary.addRow(["Incidentes en el reporte", meta.stats.total]);
	summary.addRow(["Abiertos", meta.stats.open]);
	summary.addRow(["Severidad crítica", meta.stats.critical]);
	summary.addRow(["Severidad alta", meta.stats.high]);
	summary.addRow(["Resueltos", meta.stats.resolved]);

	summary.getColumn(1).font = { ...summary.getColumn(1).font };
	summary.eachRow((row) => {
		row.getCell(1).alignment = { vertical: "top" };
		row.getCell(2).alignment = { vertical: "top", wrapText: true };
	});

	/* Hoja 2 — detalle tabular, listo para tabla dinámica o filtrado. */
	const sheet = workbook.addWorksheet("Incidentes", {
		views: [{ state: "frozen", ySplit: 1 }],
	});

	sheet.columns = [
		{ header: "Fecha", key: "date", width: 12 },
		{ header: "Hora", key: "time", width: 9 },
		{ header: "Tipo de incidente", key: "type", width: 28 },
		{ header: "Severidad", key: "severity", width: 12 },
		{ header: "Estado", key: "status", width: 14 },
		{ header: "Zona / Punto de acceso", key: "zone", width: 26 },
		{ header: "Código de zona", key: "zoneCode", width: 16 },
		{ header: "Usuario identificado", key: "user", width: 26 },
		{ header: "Correo", key: "email", width: 28 },
		{ header: "Explicación del incidente", key: "description", width: 70 },
		{ header: "Origen", key: "source", width: 14 },
		{ header: "Dirección IP", key: "ip", width: 18 },
		{ header: "Detectado el", key: "detected", width: 20 },
		{ header: "Notas de resolución", key: "notes", width: 34 },
		{ header: "Identificador", key: "id", width: 38 },
	];

	const header = sheet.getRow(1);
	header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
	header.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: HEADER_FILL },
	};
	header.alignment = { vertical: "middle", horizontal: "left" };
	header.height = 22;

	for (const row of rows) {
		const added = sheet.addRow({
			date: formatDate(row.occurredAt, meta.timeZone),
			time: formatTime(row.occurredAt, meta.timeZone),
			type: label(INCIDENT_TYPE_LABELS, row.type),
			severity: label(INCIDENT_SEVERITY_LABELS, row.severity),
			status: label(INCIDENT_STATUS_LABELS, row.status),
			zone: row.zoneName ?? "—",
			zoneCode: row.zoneCode ?? "—",
			user: row.userName ?? "No identificado",
			email: row.userEmail ?? "—",
			description: row.description,
			source: row.source,
			ip: row.ipAddress ?? "—",
			detected: formatDateTime(row.detectedAt, meta.timeZone),
			notes: row.resolutionNotes ?? "",
			id: row.id,
		});
		added.alignment = { vertical: "top", wrapText: true };

		const fill = SEVERITY_FILL[row.severity];
		if (fill) {
			added.getCell("severity").fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: fill },
			};
		}
	}

	sheet.autoFilter = {
		from: { row: 1, column: 1 },
		to: { row: 1, column: sheet.columns.length },
	};

	const output = await workbook.xlsx.writeBuffer();
	return Buffer.from(output);
}

/* ── Exportación PDF ─────────────────────────────────────────────────────── */

const MARGIN = 32;
const INK: RGB = [0.12, 0.14, 0.16];
const MUTED: RGB = [0.42, 0.45, 0.5];
const ACCENT: RGB = [0.05, 0.42, 0.55];
const LINE: RGB = [0.82, 0.84, 0.86];
const ZEBRA: RGB = [0.965, 0.97, 0.975];

const SEVERITY_INK: Record<string, RGB> = {
	critical: [0.7, 0.11, 0.16],
	high: [0.76, 0.4, 0.05],
	medium: [0.55, 0.45, 0.05],
	low: [0.2, 0.45, 0.3],
};

type Column = {
	key: string;
	title: string;
	width: number;
	wrap?: boolean;
};

const COLUMNS: Column[] = [
	{ key: "date", title: "Fecha", width: 58 },
	{ key: "time", title: "Hora", width: 34 },
	{ key: "type", title: "Tipo", width: 96 },
	{ key: "severity", title: "Severidad", width: 48 },
	{ key: "zone", title: "Zona / Área", width: 88 },
	{ key: "user", title: "Usuario", width: 104 },
	{
		key: "description",
		title: "Explicación del incidente",
		width: 290,
		wrap: true,
	},
	{ key: "status", title: "Estado", width: 60 },
];

const BODY_SIZE = 7.5;
const LINE_HEIGHT = 9.5;
const CELL_PADDING = 4;
const HEADER_ROW_HEIGHT = 18;

export function buildIncidentPdf(
	rows: IncidentRow[],
	meta: ReportMeta,
): Buffer {
	const doc = new PdfDocument();
	const contentWidth = doc.pageWidth - MARGIN * 2;
	const bottomLimit = doc.pageHeight - MARGIN - 16;

	let y = 0;

	const drawPageFrame = () => {
		doc.addPage();
		doc.rect(0, 0, doc.pageWidth, 4, { fill: ACCENT });
		doc.text(REPORT_TITLE, MARGIN, 18, { size: 10, bold: true, color: INK });
		doc.text(
			`Generado ${formatDateTime(meta.generatedAt, meta.timeZone)} · ${meta.timeZone}`,
			MARGIN,
			31,
			{ size: 7, color: MUTED },
		);
		y = 48;
	};

	const drawTableHeader = () => {
		doc.rect(MARGIN, y, contentWidth, HEADER_ROW_HEIGHT, {
			fill: [0.14, 0.16, 0.19],
		});
		let x = MARGIN;
		for (const column of COLUMNS) {
			doc.text(column.title, x + CELL_PADDING, y + 5.5, {
				size: 7.5,
				bold: true,
				color: [1, 1, 1],
			});
			x += column.width;
		}
		y += HEADER_ROW_HEIGHT;
	};

	drawPageFrame();

	/* Encabezado documental — solo en la primera página. */
	doc.text(REPORT_TITLE, MARGIN, y, { size: 17, bold: true, color: INK });
	y += 22;
	doc.text(REPORT_SUBTITLE, MARGIN, y, { size: 8.5, color: MUTED });
	y += 18;

	doc.line(MARGIN, y, doc.pageWidth - MARGIN, y, { color: LINE, width: 0.8 });
	y += 12;

	const metaEntries: [string, string][] = [
		["Generado el", formatDateTime(meta.generatedAt, meta.timeZone)],
		["Generado por", meta.generatedBy],
		...meta.filters.map((f) => [f.label, f.value] as [string, string]),
	];

	const metaColumnWidth = contentWidth / 2;
	metaEntries.forEach((entry, index) => {
		const column = index % 2;
		const row = Math.floor(index / 2);
		const x = MARGIN + column * metaColumnWidth;
		const lineY = y + row * 12;
		doc.text(`${entry[0]}:`, x, lineY, { size: 7.5, bold: true, color: MUTED });
		const labelWidth = doc.widthOf(`${entry[0]}: `, 7.5, true) + 3;
		doc.text(
			doc.truncate(entry[1], metaColumnWidth - labelWidth - 12, 7.5),
			x + labelWidth,
			lineY,
			{ size: 7.5, color: INK },
		);
	});
	y += Math.ceil(metaEntries.length / 2) * 12 + 10;

	/* Franja de totales. */
	const statCards: [string, string][] = [
		["Incidentes", String(meta.stats.total)],
		["Abiertos", String(meta.stats.open)],
		["Críticos", String(meta.stats.critical)],
		["Alta severidad", String(meta.stats.high)],
		["Resueltos", String(meta.stats.resolved)],
	];
	const cardWidth = contentWidth / statCards.length;
	doc.rect(MARGIN, y, contentWidth, 34, { fill: [0.96, 0.97, 0.98] });
	statCards.forEach(([cardLabel, value], index) => {
		const x = MARGIN + index * cardWidth + 10;
		doc.text(value, x, y + 6, { size: 13, bold: true, color: ACCENT });
		doc.text(cardLabel.toUpperCase(), x, y + 22, { size: 6.5, color: MUTED });
	});
	y += 46;

	if (rows.length === 0) {
		doc.text(
			"No se registraron incidentes de seguridad para los criterios seleccionados.",
			MARGIN,
			y,
			{ size: 9, color: MUTED },
		);
	} else {
		drawTableHeader();

		rows.forEach((row, index) => {
			const cells: Record<string, string> = {
				date: formatDate(row.occurredAt, meta.timeZone),
				time: formatTime(row.occurredAt, meta.timeZone),
				type: label(INCIDENT_TYPE_LABELS, row.type),
				severity: label(INCIDENT_SEVERITY_LABELS, row.severity),
				zone: row.zoneName ?? "—",
				user: row.userName ?? "No identificado",
				description: row.description,
				status: label(INCIDENT_STATUS_LABELS, row.status),
			};

			const wrapped = new Map<string, string[]>();
			let lineCount = 1;
			for (const column of COLUMNS) {
				if (!column.wrap) continue;
				const lines = doc.wrap(
					cells[column.key] ?? "",
					column.width - CELL_PADDING * 2,
					BODY_SIZE,
				);
				wrapped.set(column.key, lines);
				lineCount = Math.max(lineCount, lines.length);
			}

			const rowHeight = lineCount * LINE_HEIGHT + CELL_PADDING * 2;

			if (y + rowHeight > bottomLimit) {
				drawPageFrame();
				drawTableHeader();
			}

			if (index % 2 === 1) {
				doc.rect(MARGIN, y, contentWidth, rowHeight, { fill: ZEBRA });
			}

			let x = MARGIN;
			for (const column of COLUMNS) {
				const available = column.width - CELL_PADDING * 2;
				const color =
					column.key === "severity" ? (SEVERITY_INK[row.severity] ?? INK) : INK;
				const bold = column.key === "severity";

				if (column.wrap) {
					const lines = wrapped.get(column.key) ?? [];
					lines.forEach((text, lineIndex) => {
						doc.text(
							text,
							x + CELL_PADDING,
							y + CELL_PADDING + lineIndex * LINE_HEIGHT,
							{ size: BODY_SIZE, color },
						);
					});
				} else {
					doc.text(
						doc.truncate(cells[column.key] ?? "", available, BODY_SIZE, bold),
						x + CELL_PADDING,
						y + CELL_PADDING,
						{ size: BODY_SIZE, color, bold },
					);
				}
				x += column.width;
			}

			y += rowHeight;
			doc.line(MARGIN, y, doc.pageWidth - MARGIN, y, {
				color: LINE,
				width: 0.4,
			});
		});
	}

	/* Pie con paginación — se estampa al final, ya conocido el total. */
	const totalPages = doc.pageCount;
	const footerY = doc.pageHeight - MARGIN + 6;
	for (let page = 0; page < totalPages; page++) {
		doc.onPage(page, () => {
			doc.line(MARGIN, footerY - 6, doc.pageWidth - MARGIN, footerY - 6, {
				color: LINE,
				width: 0.4,
			});
			doc.text(
				`Documento generado automáticamente · ${rows.length} incidente(s)`,
				MARGIN,
				footerY,
				{ size: 7, color: MUTED },
			);
			const pageLabel = `Página ${page + 1} de ${totalPages}`;
			doc.text(
				pageLabel,
				doc.pageWidth - MARGIN - doc.widthOf(pageLabel, 7),
				footerY,
				{ size: 7, color: MUTED },
			);
		});
	}

	return doc.toBuffer();
}
