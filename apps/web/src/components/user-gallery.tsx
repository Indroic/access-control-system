import { Button, Chip, Spinner } from "@heroui/react";
import {
	ChevronLeft,
	ChevronRight,
	Download,
	ImageOff,
	Maximize2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
	EmptyState,
	formatBytes,
	formatDateTime,
} from "#/components/panel-bits";

export type UserImage = {
	id: string;
	kind: string;
	pose: string | null;
	label: string | null;
	contentType: string;
	byteSize: number;
	source: string;
	createdAt: string;
	url: string;
};

const KIND_LABEL: Record<string, string> = {
	enrollment: "Enrolamiento",
	profile: "Perfil",
	document: "Documento",
	access_capture: "Captura de acceso",
};

const POSE_LABEL: Record<string, string> = {
	front: "Frontal",
	right: "Perfil derecho",
	left: "Perfil izquierdo",
};

function imageTitle(image: UserImage) {
	return (
		image.label ??
		(image.pose ? POSE_LABEL[image.pose] : undefined) ??
		KIND_LABEL[image.kind] ??
		"Imagen de registro"
	);
}

/* ── Visor a pantalla completa ───────────────────────────────────────────── */

function ImageLightbox({
	images,
	index,
	onClose,
	onNavigate,
}: {
	images: UserImage[];
	index: number;
	onClose: () => void;
	onNavigate: (nextIndex: number) => void;
}) {
	const image = images[index];
	const hasMultiple = images.length > 1;

	const goPrevious = useCallback(() => {
		onNavigate((index - 1 + images.length) % images.length);
	}, [index, images.length, onNavigate]);

	const goNext = useCallback(() => {
		onNavigate((index + 1) % images.length);
	}, [index, images.length, onNavigate]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			if (!hasMultiple) return;
			if (event.key === "ArrowLeft") goPrevious();
			if (event.key === "ArrowRight") goNext();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, goPrevious, goNext, hasMultiple]);

	if (!image) return null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: overlay propio con foco gestionado por teclado
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Visor de imagen: ${imageTitle(image)}`}
			className="fixed inset-0 z-[100] flex flex-col bg-black/92 backdrop-blur-sm"
		>
			<div className="flex items-center justify-between gap-3 px-4 py-3">
				<div className="min-w-0">
					<p className="truncate font-display font-semibold text-sm text-white">
						{imageTitle(image)}
					</p>
					<p className="readout truncate text-[11px] text-white/60">
						{formatDateTime(image.createdAt)} · {formatBytes(image.byteSize)}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{hasMultiple && (
						<span className="readout text-[11px] text-white/70">
							{index + 1} / {images.length}
						</span>
					)}
					<a
						href={image.url}
						download={`${image.id}.jpg`}
						className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1.5 text-[11px] text-white/85 transition-colors hover:bg-white/10"
					>
						<Download size={14} />
						Descargar
					</a>
					<Button
						onPress={onClose}
						variant="tertiary"
						size="sm"
						isIconOnly
						aria-label="Cerrar visor"
						className="text-white"
					>
						<X size={18} />
					</Button>
				</div>
			</div>

			<div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
				{hasMultiple && (
					<Button
						onPress={goPrevious}
						variant="tertiary"
						size="sm"
						isIconOnly
						aria-label="Imagen anterior"
						className="absolute left-2 z-10 text-white sm:left-6"
					>
						<ChevronLeft size={24} />
					</Button>
				)}

				<img
					src={image.url}
					alt={imageTitle(image)}
					className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
				/>

				{hasMultiple && (
					<Button
						onPress={goNext}
						variant="tertiary"
						size="sm"
						isIconOnly
						aria-label="Imagen siguiente"
						className="absolute right-2 z-10 text-white sm:right-6"
					>
						<ChevronRight size={24} />
					</Button>
				)}
			</div>

			{hasMultiple && (
				<div className="flex justify-center gap-2 px-4 pb-5">
					{images.map((thumb, thumbIndex) => (
						<button
							key={thumb.id}
							type="button"
							onClick={() => onNavigate(thumbIndex)}
							aria-label={`Ver ${imageTitle(thumb)}`}
							aria-current={thumbIndex === index ? "true" : undefined}
							className={`size-12 overflow-hidden rounded border-2 transition-opacity ${
								thumbIndex === index
									? "border-accent opacity-100"
									: "border-transparent opacity-55 hover:opacity-85"
							}`}
						>
							<img
								src={thumb.url}
								alt=""
								className="size-full object-cover"
								loading="lazy"
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/* ── Miniatura ───────────────────────────────────────────────────────────── */

function Thumbnail({
	image,
	onOpen,
}: {
	image: UserImage;
	onOpen: () => void;
}) {
	const [failed, setFailed] = useState(false);

	return (
		<figure className="group overflow-hidden rounded-md border border-separator bg-surface-secondary">
			<button
				type="button"
				onClick={onOpen}
				className="relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-black/40"
				aria-label={`Ampliar ${imageTitle(image)}`}
			>
				{failed ? (
					<span className="flex size-full flex-col items-center justify-center gap-1.5 text-muted">
						<ImageOff size={20} />
						<span className="telemetry">Sin vista previa</span>
					</span>
				) : (
					<img
						src={image.url}
						alt={imageTitle(image)}
						loading="lazy"
						onError={() => setFailed(true)}
						className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
					/>
				)}
				<span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
					<Maximize2 size={18} className="text-white" />
				</span>
			</button>
			<figcaption className="flex items-center justify-between gap-2 px-2.5 py-2">
				<span className="truncate font-medium text-[12px] text-foreground">
					{imageTitle(image)}
				</span>
				<span className="readout shrink-0 text-[10px] text-muted">
					{formatBytes(image.byteSize)}
				</span>
			</figcaption>
		</figure>
	);
}

/* ── Galería ─────────────────────────────────────────────────────────────── */

export function UserGallery({
	images,
	isLoading = false,
}: {
	images: UserImage[];
	isLoading?: boolean;
}) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center gap-3 py-14 text-muted">
				<Spinner />
				<span className="telemetry">Cargando evidencia…</span>
			</div>
		);
	}

	if (images.length === 0) {
		return (
			<EmptyState
				icon={<ImageOff size={22} className="text-muted" />}
				title="Sin evidencia fotográfica"
				body="No hay imágenes de registro asociadas a este usuario. Se archivarán automáticamente al capturar su biometría facial."
			/>
		);
	}

	return (
		<>
			<div className="mb-3 flex items-center gap-2">
				<Chip color="accent" variant="soft" size="sm">
					<Chip.Label>
						{images.length} {images.length === 1 ? "imagen" : "imágenes"}
					</Chip.Label>
				</Chip>
				<span className="telemetry">Clic para ampliar</span>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{images.map((image, index) => (
					<Thumbnail
						key={image.id}
						image={image}
						onOpen={() => setLightboxIndex(index)}
					/>
				))}
			</div>

			{lightboxIndex !== null && (
				<ImageLightbox
					images={images}
					index={lightboxIndex}
					onClose={() => setLightboxIndex(null)}
					onNavigate={setLightboxIndex}
				/>
			)}
		</>
	);
}
