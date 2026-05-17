import { Buffer } from "node:buffer";

import { env } from "@access-control-system/env/server";
import { createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";
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
});

const authenticateFaceSchema = imagePayloadSchema;

function base64ToBlob(imageBase64: string, mimeType = "image/jpeg") {
    const normalized = imageBase64.includes(",") ? imageBase64.split(",").at(-1) ?? imageBase64 : imageBase64;
    const bytes = Buffer.from(normalized, "base64");
    return new Blob([bytes], { type: mimeType });
}

async function callBiometricApi<TResponse>(
    path: string,
    options: { body?: FormData | Record<string, unknown>; method?: "GET" | "POST" } = {},
): Promise<TResponse> {
    const response = await fetch(new URL(path, env.BIOMETRIC_API_URL), {
        method: options.method ?? "POST",
        body: options.body instanceof FormData ? options.body : JSON.stringify(options.body ?? {}),
        headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "Biometric API request failed");
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

    const result = await callBiometricApi<BiometricRegisterResponse>("/biometrics/register", {
        body: formData,
    });

    const updatedUser = await ctx.context.internalAdapter.updateUser(body.userId, {
        faceRegistered: true,
        faceMeta: {
            registeredAt: new Date().toISOString(),
            source: "biometric-api",
            biometricResponse: result,
        },
    });

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

    const result = await callBiometricApi<BiometricIdentifyResponse>("/biometrics/identify", {
        body: formData,
    });

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

    const result = await callBiometricApi<BiometricIdentifyResponse>("/biometrics/identify", {
        body: formData,
    });

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