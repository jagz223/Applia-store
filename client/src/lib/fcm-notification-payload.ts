export type ParsedFcmNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
  isPanic: boolean;
  isRideOffer: boolean;
};

/** Parsea payload FCM (web push / onMessage) al formato de notificación del sistema. */
export function parseFcmNotificationPayload(payload: {
  notification?: { title?: string; body?: string };
  data?: Record<string, string | undefined>;
}): ParsedFcmNotification {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "Genfeb";
  const body = notification.body || data.body || "Tienes una nueva notificación";
  const url = data.url || "/";
  const tagType = data.type || data.withdrawalType || data.conversationId || data.transferId || "genfeb";
  const tagId = data.bookingId || data.messageId || data.transferId || data.conversationId || String(Date.now());
  const tag = `genfeb-${String(tagType).replace(/[^a-zA-Z0-9-_]/g, "_")}-${String(tagId).replace(/[^a-zA-Z0-9-_]/g, "_")}`;
  const isPanic = String(data.type || "").toLowerCase() === "go_panic";
  const offerType = String(data.type || "").toLowerCase();
  const isRideOffer = offerType === "cargo_ride_offer" || offerType === "pack_ride_offer";
  return { title, body, url, tag, isPanic, isRideOffer };
}

export async function showSystemNotification(parsed: ParsedFcmNotification): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: parsed.body,
    icon: "/genfeb-logo-new.png",
    badge: "/genfeb-logo-new.png",
    tag: parsed.tag,
    data: { url: parsed.url },
    ...(parsed.isPanic
      ? {
          requireInteraction: true,
          vibrate: [300, 200, 300, 200, 300, 200, 500],
        }
      : parsed.isRideOffer
        ? {
            requireInteraction: true,
            vibrate: [200, 120, 200, 120, 200, 120, 400],
          }
        : {}),
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (registration) {
      await registration.showNotification(parsed.title, options);
      return;
    }
  }

  new Notification(parsed.title, options);
}
