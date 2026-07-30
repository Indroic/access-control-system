import { Buffer } from "node:buffer";

import { createDb } from "@access-control-system/db";
import { user } from "@access-control-system/db/schema/auth";
import { userImage } from "@access-control-system/db/schema/media";
import { env } from "@access-control-system/env/server";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { z } from "zod";

type BiometricIdentifyResponse = {
	match: boolean;
	user_id?: string;
	message?: string;
};

type BiometricRegisterResponse = {
	status?: string;
	message?: string;
	count?: number;
};

const imagePayloadSchema = z.object({
	imageBase64: z.string().min(1),
	mimeType: z.string().min(1).optional(),
});

const registerFaceSchema = imagePayloadSchema.extend({
	userId: z.string().min(1),
	performedBy: z.string().optional(),
	/** Pose capturada; se usa para etiquetar la evidencia en la galería. */
	pose: z.enum(["front", "right", "left"]).optional(),
});

const authenticateFaceSchema = imagePayloadSchema;

/** Quita el prefijo `data:` de un data-URL y devuelve los bytes crudos. */
function base64ToBuffer(imageBase64: string) {
	const normalized = imageBase64.includes(",")
		? (imageBase64.split(",").at(-1) ?? imageBase64)
		: imageBase64;
	return Buffer.from(normalized, "base64");
}

function base64ToBlob(imageBase64: string, mimeType = "image/jpeg") {
	return new Blob([base64ToBuffer(imageBase64)], { type: mimeType });
}

const POSE_LABELS: Record<string, string> = {
	front: "Captura frontal",
	right: "Perfil derecho",
	left: "Perfil izquierdo",
};

/**
 * Archiva la fotografía usada en el enrolamiento como evidencia del alta.
 *
 * Nunca propaga errores: si el archivado falla, el enrolamiento biométrico —que
 * ya se completó en el servicio de reconocimiento— debe seguir siendo un éxito.
 */
async function archiveRegistrationImage(input: {
	userId: string;
	imageBase64: string;
	mimeType?: string;
	pose?: "front" | "right" | "left";
	performedBy?: string;
}): Promise<void> {
	try {
		const bytes = base64ToBuffer(input.imageBase64);
		if (bytes.byteLength === 0) return;

		const db = createDb();

		// `performedBy` llega del cliente: solo se guarda como operador si
		// corresponde a un usuario real, o la FK abortaría el archivado.
		let capturedBy: string | null = null;
		if (input.performedBy) {
			const [operator] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, input.performedBy))
				.limit(1);
			capturedBy = operator?.id ?? null;
		}

		await db.insert(userImage).values({
			userId: input.userId,
			kind: "enrollment",
			pose: input.pose ?? null,
			label: input.pose
				? (POSE_LABELS[input.pose] ?? null)
				: "Captura de enrolamiento",
			contentType: input.mimeType ?? "image/jpeg",
			byteSize: bytes.byteLength,
			data: bytes,
			capturedBy,
			source: "face-enrollment",
		});
	} catch (error) {
		console.error(
			"[biometrics] No se pudo archivar la imagen de registro:",
			error,
		);
	}
}

async function callBiometricApi<TResponse>(
	path: string,
	options: {
		body?: FormData | Record<string, unknown>;
		method?: "GET" | "POST";
	} = {},
): Promise<TResponse> {
	const headers = new Headers();
	if (!(options.body instanceof FormData)) {
		headers.set("Content-Type", "application/json");
	}
	headers.set("Authorization", `Bearer ${env.INTERNAL_API_KEY}`);

	const response = await fetch(new URL(path, env.BIOMETRIC_API_URL), {
		method: options.method ?? "POST",
		body:
			options.body instanceof FormData
				? options.body
				: JSON.stringify(options.body ?? {}),
		headers,
	});

	if (!response.ok) {
		const detail = await response
			.text()
			.catch(() => "Biometric API request failed");
		throw new APIError("BAD_GATEWAY", {
			message: detail || "Biometric API request failed",
		});
	}

	return (await response.json()) as TResponse;
}

async function registerFaceHandler(ctx: GenericEndpointContext) {
	const body = registerFaceSchema.parse(ctx.body);
	const formData = new FormData();
	formData.append("user_id", body.userId);
	formData.append(
		"files",
		base64ToBlob(body.imageBase64, body.mimeType),
		"face.jpg",
	);
	if (body.performedBy) {
		formData.append("performed_by", body.performedBy);
	}

	const result = await callBiometricApi<BiometricRegisterResponse>(
		"/v1/biometrics/register",
		{
			body: formData,
		},
	);

	// Evidencia fotográfica del alta: se archiva tras confirmar el enrolamiento.
	await archiveRegistrationImage({
		userId: body.userId,
		imageBase64: body.imageBase64,
		mimeType: body.mimeType,
		pose: body.pose,
		performedBy: body.performedBy,
	});

	const updatedUser = await ctx.context.internalAdapter.updateUser(
		body.userId,
		{
			faceRegistered: true,
			faceMeta: JSON.stringify({
				registeredAt: new Date().toISOString(),
				source: "biometric-api",
				biometricResponse: result,
			}),
		},
	);

	return ctx.json({
		status: true,
		user: updatedUser,
		biometric: result,
	});
}

async function authenticateFaceHandler(ctx: GenericEndpointContext) {
	const body = authenticateFaceSchema.parse(ctx.body);
	const formData = new FormData();
	formData.append(
		"file",
		base64ToBlob(body.imageBase64, body.mimeType),
		"face.jpg",
	);
	formData.append("purpose", "login");

	const result = await callBiometricApi<BiometricIdentifyResponse>(
		"/v1/biometrics/identify",
		{
			body: formData,
		},
	);

	if (!result.match || !result.user_id) {
		throw new APIError("NOT_FOUND", {
			message: result.message || "No face match found",
		});
	}

	const user = await ctx.context.internalAdapter.findUserById(result.user_id);
	if (!user) {
		throw new APIError("NOT_FOUND", {
			message: "User not found for biometric match",
		});
	}

	const session = await ctx.context.internalAdapter.createSession(user.id);
	if (!session) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Could not create session",
		});
	}

	await setSessionCookie(ctx, {
		session,
		user,
	});

	return ctx.json({
		status: true,
		token: session.token,
		session,
		user,
	});
}

async function searchUserByFaceHandler(ctx: GenericEndpointContext) {
	const body = authenticateFaceSchema.parse(ctx.body);
	const formData = new FormData();
	formData.append(
		"file",
		base64ToBlob(body.imageBase64, body.mimeType),
		"face.jpg",
	);

	const result = await callBiometricApi<BiometricIdentifyResponse>(
		"/v1/biometrics/identify",
		{
			body: formData,
		},
	);

	if (!result.match || !result.user_id) {
		throw new APIError("NOT_FOUND", {
			message: result.message || "No face match found",
		});
	}

	const user = await ctx.context.internalAdapter.findUserById(result.user_id);
	if (!user) {
		throw new APIError("NOT_FOUND", {
			message: "User not found for biometric match",
		});
	}

	return ctx.json({
		status: true,
		user,
		biometric: result,
	});
}

export const faceBiometricsPlugin = () =>
	({
		id: "face-biometrics",
		schema: {
			user: {
				fields: {
					faceRegistered: {
						type: "boolean",
						required: false,
						defaultValue: false,
					},
					faceMeta: { type: "string", required: false },
				},
			},
		},
		endpoints: {
			registerFace: createAuthEndpoint(
				"/face-biometrics/register-face",
				{
					method: "POST",
					body: registerFaceSchema,
				},
				registerFaceHandler,
			),
			authenticateFace: createAuthEndpoint(
				"/face-biometrics/authenticate-face",
				{
					method: "POST",
					body: authenticateFaceSchema,
				},
				authenticateFaceHandler,
			),
			searchUserByFace: createAuthEndpoint(
				"/face-biometrics/search-user-by-face",
				{
					method: "POST",
					body: authenticateFaceSchema,
				},
				searchUserByFaceHandler,
			),
		},
	}) satisfies BetterAuthPlugin;

export const biometricPlugin = faceBiometricsPlugin;
