import { env } from "@access-control-system/env/server";

import { protectedProcedure, router } from "../index";

export const auditRouter = router({
	list: protectedProcedure.query(async () => {
		try {
			const response = await fetch(`${env.BIOMETRIC_API_URL}/v1/audit`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${env.INTERNAL_API_KEY}`,
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch audit logs: ${response.statusText}`);
			}

			const data = (await response.json()) as any;

			// HexCore query use cases normally wrap results in "items" property
			return data.items || data;
		} catch (error) {
			console.error("Error fetching audit logs from Biometric API:", error);
			return [];
		}
	}),
});
