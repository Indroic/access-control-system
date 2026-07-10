export type PushSubscriptionRow = {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
};

export type SuspiciousLoginPayload = {
	userId: string;
	userName: string | null;
	ip: string | null;
	userAgent: string | null;
	score: number;
	reason: string;
	loginHour: number;
	occurredAt: string;
};

export type WebPushClient = {
	sendNotification: (
		subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
		payload: string,
	) => Promise<unknown>;
};

export async function notifySuspiciousLogin(params: {
	subscriptions: PushSubscriptionRow[];
	webpush: WebPushClient;
	payload: SuspiciousLoginPayload;
	onExpired: (subscriptionId: string) => Promise<void>;
}): Promise<{ sent: number; removed: number }> {
	const { subscriptions, webpush, payload, onExpired } = params;

	const notificationPayload = JSON.stringify({
		title: "Login biométrico sospechoso",
		body: `${payload.userName ?? payload.userId} inició sesión a una hora inusual (score ${payload.score.toFixed(2)}).`,
		data: {
			userId: payload.userId,
			occurredAt: payload.occurredAt,
			action: "biometric_suspicious_login",
		},
	});

	let sent = 0;
	let removed = 0;

	await Promise.all(
		subscriptions.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					notificationPayload,
				);
				sent += 1;
			} catch (error) {
				const statusCode = (error as { statusCode?: number })?.statusCode;
				if (statusCode === 404 || statusCode === 410) {
					try {
						await onExpired(sub.id);
						removed += 1;
					} catch (cleanupError) {
						console.error("Fallo al limpiar suscripción expirada", sub.id, cleanupError);
					}
				} else {
					console.error("Fallo al enviar push a", sub.endpoint, error);
				}
			}
		}),
	);

	return { sent, removed };
}
