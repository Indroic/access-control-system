/**
 * Cliente tRPC mínimo sobre `fetch`.
 *
 * El router no usa transformadores, así que el protocolo HTTP se reduce a:
 *   query     → GET  /api/trpc/<ruta>?input=<json url-encoded>
 *   mutation  → POST /api/trpc/<ruta>  con el input como cuerpo JSON
 * y la respuesta llega en `{ result: { data } }` o `{ error: { message } }`.
 */

export class TrpcError extends Error {
	readonly code: string | undefined;
	readonly httpStatus: number;

	constructor(message: string, code: string | undefined, httpStatus: number) {
		super(message);
		this.name = "TrpcError";
		this.code = code;
		this.httpStatus = httpStatus;
	}
}

type TrpcEnvelope<T> = {
	result?: { data: T };
	error?: { message?: string; data?: { code?: string } };
};

async function unwrap<T>(response: Response): Promise<T> {
	const payload = (await response
		.json()
		.catch(() => null)) as TrpcEnvelope<T> | null;

	if (!response.ok || payload?.error) {
		throw new TrpcError(
			payload?.error?.message ?? `Error ${response.status} en la solicitud.`,
			payload?.error?.data?.code,
			response.status,
		);
	}

	if (!payload?.result) {
		throw new TrpcError("Respuesta inesperada del servidor.", undefined, 500);
	}

	return payload.result.data;
}

export async function trpcQuery<T>(path: string, input?: unknown): Promise<T> {
	const query =
		input === undefined
			? ""
			: `?input=${encodeURIComponent(JSON.stringify(input))}`;

	const response = await fetch(`/api/trpc/${path}${query}`, {
		credentials: "include",
	});
	return unwrap<T>(response);
}

export async function trpcMutate<T>(path: string, input?: unknown): Promise<T> {
	const response = await fetch(`/api/trpc/${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input ?? {}),
		credentials: "include",
	});
	return unwrap<T>(response);
}

/** Construye la query string de los reportes descargables. */
export function buildQueryString(
	params: Record<string, string | number | undefined | null>,
): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === "") continue;
		search.set(key, String(value));
	}
	const serialized = search.toString();
	return serialized ? `?${serialized}` : "";
}
