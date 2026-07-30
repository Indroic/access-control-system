import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { AppShell } from "#/components/app-shell";
import { authClient } from "#/utils/auth-client";

export const Route = createFileRoute("/_panel")({ component: PanelLayout });

/** Claves que el flujo en vivo (SSE) mantiene frescas. */
const LIVE_QUERY_KEYS = [
	["employees"],
	["auditLogs"],
	["incidents"],
	["incidentStats"],
];

function PanelLayout() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: sessionData,
		isPending: sessionLoading,
		error: sessionError,
	} = authClient.useSession();

	useEffect(() => {
		if (!sessionLoading && (sessionError || !sessionData)) {
			navigate({ to: "/" });
		}
	}, [sessionError, sessionData, sessionLoading, navigate]);

	// Una sola conexión SSE para todo el panel, en vez de una por vista.
	useEffect(() => {
		if (!sessionData) return;
		const eventSource = new EventSource("/api/sse/live-updates");
		eventSource.onmessage = (event) => {
			if (event.data !== "update" && event.data !== "sync") return;
			for (const queryKey of LIVE_QUERY_KEYS) {
				queryClient.invalidateQueries({ queryKey });
			}
		};
		eventSource.onerror = (error) => {
			console.warn("Conexión SSE interrumpida. Reconectando…", error);
		};
		return () => eventSource.close();
	}, [sessionData, queryClient]);

	if (sessionLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted">
				<RefreshCw className="animate-spin" size={28} />
			</div>
		);
	}

	if (!sessionData) return null;

	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
