import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; i++) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

export function usePushNotifications() {
	const [isSupported, setIsSupported] = useState(false);
	const [isSubscribed, setIsSubscribed] = useState(false);

	useEffect(() => {
		setIsSupported(
			typeof navigator !== "undefined" &&
				"serviceWorker" in navigator &&
				"PushManager" in window,
		);
	}, []);

	useEffect(() => {
		if (!isSupported) return;
		navigator.serviceWorker
			.getRegistration("/push-sw.js")
			.then(async (registration) => {
				const subscription = await registration?.pushManager.getSubscription();
				setIsSubscribed(!!subscription);
			});
	}, [isSupported]);

	const subscribe = useCallback(async () => {
		const registration = await navigator.serviceWorker.register("/push-sw.js");

		const permission = await Notification.requestPermission();
		if (permission !== "granted") {
			throw new Error("Permiso de notificaciones denegado.");
		}

		const keyRes = await fetch("/api/trpc/notifications.getVapidPublicKey");
		if (!keyRes.ok) throw new Error("No se pudo obtener la clave VAPID.");
		const keyData = await keyRes.json();
		const publicKey = keyData.result.data.publicKey as string;

		// `PushManager.subscribe` exige un BufferSource respaldado por ArrayBuffer;
		// se copia a uno propio para descartar el caso SharedArrayBuffer.
		const keyBytes = urlBase64ToUint8Array(publicKey);
		const applicationServerKey = new Uint8Array(keyBytes.byteLength);
		applicationServerKey.set(keyBytes);

		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey,
		});

		const res = await fetch("/api/trpc/notifications.subscribe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(subscription.toJSON()),
		});
		if (!res.ok) throw new Error("No se pudo guardar la suscripción.");

		setIsSubscribed(true);
	}, []);

	const unsubscribe = useCallback(async () => {
		const registration =
			await navigator.serviceWorker.getRegistration("/push-sw.js");
		const subscription = await registration?.pushManager.getSubscription();
		if (!subscription) {
			setIsSubscribed(false);
			return;
		}

		const res = await fetch("/api/trpc/notifications.unsubscribe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ endpoint: subscription.endpoint }),
		});
		if (!res.ok) throw new Error("No se pudo desuscribirse.");
		await subscription.unsubscribe();
		setIsSubscribed(false);
	}, []);

	return { isSupported, isSubscribed, subscribe, unsubscribe };
}
