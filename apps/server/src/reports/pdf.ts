import { Buffer } from "node:buffer";

/**
 * Generador mínimo de PDF, sin dependencias.
 *
 * Solo cubre lo que necesita un reporte tabular de auditoría: texto con las
 * fuentes base Helvetica/Helvetica-Bold (siempre presentes en cualquier lector,
 * no hay que incrustar archivos), líneas y rectángulos. Se prefirió esto a una
 * librería de PDF porque el servidor se empaqueta con tsdown/bun y las
 * librerías del ecosistema cargan sus métricas de fuente desde disco en tiempo
 * de ejecución, lo que se rompe al bundlear.
 *
 * El sistema de coordenadas expuesto es el intuitivo (origen arriba-izquierda,
 * `y` crece hacia abajo); la conversión al espacio PDF ocurre internamente.
 */

/** Anchos AFM de Helvetica para ASCII 32–126, en milésimas de em. */
const HELVETICA_WIDTHS: number[] = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
	278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
	584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
	833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
	278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
	500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
	500, 334, 260, 334, 584,
];

/** Las mayúsculas acentuadas del español son notablemente más anchas. */
const DEFAULT_WIDTH = 556;

export type RGB = [number, number, number];

export type TextOptions = {
	size?: number;
	bold?: boolean;
	color?: RGB;
};

type Page = { ops: string[] };

function escapePdfText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)")
		.replace(/\r/g, "")
		.replace(/\n/g, " ");
}

function fmt(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function colorOp(color: RGB, stroke: boolean): string {
	const [r, g, b] = color;
	return `${fmt(r)} ${fmt(g)} ${fmt(b)} ${stroke ? "RG" : "rg"}`;
}

export type PdfDocumentOptions = {
	pageWidth?: number;
	pageHeight?: number;
};

export class PdfDocument {
	readonly pageWidth: number;
	readonly pageHeight: number;
	private readonly pages: Page[] = [];
	private current: Page | null = null;

	constructor(options: PdfDocumentOptions = {}) {
		// A4 apaisado por defecto: la tabla de incidentes necesita el ancho.
		this.pageWidth = options.pageWidth ?? 842;
		this.pageHeight = options.pageHeight ?? 595;
	}

	get pageCount(): number {
		return this.pages.length;
	}

	addPage(): void {
		this.current = { ops: [] };
		this.pages.push(this.current);
	}

	private page(): Page {
		if (!this.current) this.addPage();
		// biome-ignore lint/style/noNonNullAssertion: addPage() garantiza el valor.
		return this.current!;
	}

	/**
	 * Dibuja sobre una página ya creada. Necesario para los pies de página, que
	 * solo pueden numerarse cuando se conoce el total de páginas.
	 */
	onPage(index: number, draw: () => void): void {
		const target = this.pages[index];
		if (!target) return;
		const previous = this.current;
		this.current = target;
		try {
			draw();
		} finally {
			this.current = previous;
		}
	}

	/** Ancho de una cadena en puntos para el tamaño y peso indicados. */
	widthOf(text: string, size: number, bold = false): number {
		let total = 0;
		for (const char of text) {
			const code = char.charCodeAt(0);
			const width =
				code >= 32 && code <= 126
					? (HELVETICA_WIDTHS[code - 32] ?? DEFAULT_WIDTH)
					: DEFAULT_WIDTH;
			total += width;
		}
		// La variante negrita es ~5 % más ancha que la regular.
		return (total / 1000) * size * (bold ? 1.05 : 1);
	}

	/** Corta el texto con puntos suspensivos si excede el ancho disponible. */
	truncate(text: string, maxWidth: number, size: number, bold = false): string {
		if (this.widthOf(text, size, bold) <= maxWidth) return text;
		const ellipsis = "…";
		let result = "";
		for (const char of text) {
			if (this.widthOf(result + char + ellipsis, size, bold) > maxWidth) {
				break;
			}
			result += char;
		}
		return `${result.trimEnd()}${ellipsis}`;
	}

	/** Reparte el texto en líneas que caben en `maxWidth`. */
	wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
		const words = text.replace(/\s+/g, " ").trim().split(" ");
		const lines: string[] = [];
		let line = "";

		for (const word of words) {
			const candidate = line ? `${line} ${word}` : word;
			if (this.widthOf(candidate, size, bold) <= maxWidth) {
				line = candidate;
				continue;
			}
			if (line) lines.push(line);
			// Palabra sola más ancha que la columna: se parte por caracteres.
			if (this.widthOf(word, size, bold) > maxWidth) {
				let chunk = "";
				for (const char of word) {
					if (this.widthOf(chunk + char, size, bold) > maxWidth) {
						lines.push(chunk);
						chunk = char;
					} else {
						chunk += char;
					}
				}
				line = chunk;
			} else {
				line = word;
			}
		}
		if (line) lines.push(line);
		return lines.length > 0 ? lines : [""];
	}

	text(value: string, x: number, yFromTop: number, options: TextOptions = {}) {
		const size = options.size ?? 9;
		const font = options.bold ? "/F2" : "/F1";
		const color = options.color ?? [0, 0, 0];
		const y = this.pageHeight - yFromTop - size;
		this.page().ops.push(
			`q ${colorOp(color, false)} BT ${font} ${fmt(size)} Tf ${fmt(x)} ${fmt(
				y,
			)} Td (${escapePdfText(value)}) Tj ET Q`,
		);
	}

	line(
		x1: number,
		y1FromTop: number,
		x2: number,
		y2FromTop: number,
		options: { width?: number; color?: RGB } = {},
	) {
		const color = options.color ?? [0.8, 0.8, 0.8];
		const width = options.width ?? 0.5;
		this.page().ops.push(
			`q ${colorOp(color, true)} ${fmt(width)} w ${fmt(x1)} ${fmt(
				this.pageHeight - y1FromTop,
			)} m ${fmt(x2)} ${fmt(this.pageHeight - y2FromTop)} l S Q`,
		);
	}

	rect(
		x: number,
		yFromTop: number,
		width: number,
		height: number,
		options: { fill?: RGB } = {},
	) {
		const fill = options.fill ?? [0.95, 0.95, 0.95];
		this.page().ops.push(
			`q ${colorOp(fill, false)} ${fmt(x)} ${fmt(
				this.pageHeight - yFromTop - height,
			)} ${fmt(width)} ${fmt(height)} re f Q`,
		);
	}

	toBuffer(): Buffer {
		if (this.pages.length === 0) this.addPage();

		const objects: Buffer[] = [];
		const pageObjectStart = 5;
		const pageIds = this.pages.map((_, i) => pageObjectStart + i * 2);

		// 1: catálogo, 2: árbol de páginas, 3-4: fuentes base.
		objects.push(
			Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
			Buffer.from(
				`<< /Type /Pages /Kids [${pageIds
					.map((id) => `${id} 0 R`)
					.join(" ")}] /Count ${this.pages.length} >>`,
				"latin1",
			),
			Buffer.from(
				"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
				"latin1",
			),
			Buffer.from(
				"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
				"latin1",
			),
		);

		this.pages.forEach((page, index) => {
			const contentId = pageObjectStart + index * 2 + 1;
			objects.push(
				Buffer.from(
					`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(
						this.pageWidth,
					)} ${fmt(
						this.pageHeight,
					)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
					"latin1",
				),
			);
			const stream = Buffer.from(page.ops.join("\n"), "latin1");
			objects.push(
				Buffer.concat([
					Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "latin1"),
					stream,
					Buffer.from("\nendstream", "latin1"),
				]),
			);
		});

		const headerChunk = Buffer.from("%PDF-1.4\n", "latin1");
		const chunks: Buffer[] = [headerChunk];
		let offset = headerChunk.length;
		const offsets: number[] = [];

		objects.forEach((body, index) => {
			const objNumber = index + 1;
			const chunk = Buffer.concat([
				Buffer.from(`${objNumber} 0 obj\n`, "latin1"),
				body,
				Buffer.from("\nendobj\n", "latin1"),
			]);
			offsets.push(offset);
			offset += chunk.length;
			chunks.push(chunk);
		});

		const xrefOffset = offset;
		const total = objects.length + 1;
		let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
		for (const objOffset of offsets) {
			xref += `${String(objOffset).padStart(10, "0")} 00000 n \n`;
		}
		xref += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
		chunks.push(Buffer.from(xref, "latin1"));

		return Buffer.concat(chunks);
	}
}
