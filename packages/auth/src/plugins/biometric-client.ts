import type { BetterFetchOption } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "better-auth/client";

import type { faceBiometricsPlugin } from "./biometric";

export const faceBiometricsClientPlugin = () =>
	({
		id: "face-biometrics",
		$InferServerPlugin: {} as ReturnType<typeof faceBiometricsPlugin>,
		getActions: ($fetch) => ({
			registerFace: async (
				data: {
					imageBase64: string;
					mimeType?: string;
					userId: string;
					performedBy?: string;
				},
				fetchOptions?: BetterFetchOption,
			) =>
				$fetch("/face-biometrics/register-face", {
					method: "POST",
					body: data,
					...fetchOptions,
				}),

			authenticateFace: async (
				data: { imageBase64: string; mimeType?: string },
				fetchOptions?: BetterFetchOption,
			) =>
				$fetch("/face-biometrics/authenticate-face", {
					method: "POST",
					body: data,
					...fetchOptions,
				}),

			searchUserByFace: async (
				data: { imageBase64: string; mimeType?: string },
				fetchOptions?: BetterFetchOption,
			) =>
				$fetch("/face-biometrics/search-user-by-face", {
					method: "POST",
					body: data,
					...fetchOptions,
				}),
		}),
	}) satisfies BetterAuthClientPlugin;

export const biometricClientPlugin = faceBiometricsClientPlugin;
