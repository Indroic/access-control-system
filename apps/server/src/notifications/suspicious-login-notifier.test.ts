import { describe, expect, it, vi } from "vitest";
import { notifySuspiciousLogin } from "./suspicious-login-notifier";

function makeSubscription(id: string) {
	return {
		id,
		endpoint: `https://push.example/${id}`,
		p256dh: "p256dh",
		auth: "auth",
	};
}

const basePayload = {
	userId: "u1",
	userName: null as string | null,
	ip: null as string | null,
	userAgent: null as string | null,
	score: 3.2,
	reason: "unusual_hour",
	loginHour: 3,
	occurredAt: "2026-01-01T03:00:00.000Z",
};

describe("notifySuspiciousLogin", () => {
	it("sends a push to every subscription", async () => {
		const sendNotification = vi.fn().mockResolvedValue(undefined);
		const onExpired = vi.fn().mockResolvedValue(undefined);

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a"), makeSubscription("b")],
			webpush: { sendNotification },
			payload: { ...basePayload, userName: "Ada" },
			onExpired,
		});

		expect(sendNotification).toHaveBeenCalledTimes(2);
		expect(onExpired).not.toHaveBeenCalled();
		expect(result).toEqual({ sent: 2, removed: 0 });
	});

	it("removes subscriptions that respond with 410 Gone", async () => {
		const sendNotification = vi.fn().mockRejectedValue({ statusCode: 410 });
		const onExpired = vi.fn().mockResolvedValue(undefined);

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a")],
			webpush: { sendNotification },
			payload: basePayload,
			onExpired,
		});

		expect(onExpired).toHaveBeenCalledWith("a");
		expect(result).toEqual({ sent: 0, removed: 1 });
	});

	it("keeps sending to remaining subscriptions when one fails with a non-expiry error", async () => {
		const sendNotification = vi
			.fn()
			.mockRejectedValueOnce({ statusCode: 500 })
			.mockResolvedValueOnce(undefined);
		const onExpired = vi.fn().mockResolvedValue(undefined);

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a"), makeSubscription("b")],
			webpush: { sendNotification },
			payload: basePayload,
			onExpired,
		});

		expect(onExpired).not.toHaveBeenCalled();
		expect(result).toEqual({ sent: 1, removed: 0 });
	});

	it("does not throw when the onExpired callback itself fails", async () => {
		const sendNotification = vi.fn().mockRejectedValue({ statusCode: 410 });
		const onExpired = vi.fn().mockRejectedValue(new Error("db unavailable"));

		const result = await notifySuspiciousLogin({
			subscriptions: [makeSubscription("a")],
			webpush: { sendNotification },
			payload: basePayload,
			onExpired,
		});

		expect(result).toEqual({ sent: 0, removed: 0 });
	});
});
