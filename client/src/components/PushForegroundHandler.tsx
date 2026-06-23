import { useEffect, useRef } from "react";
import { getMessagingIfSupported } from "@/lib/firebase-client";
import { parseFcmNotificationPayload, showSystemNotification } from "@/lib/fcm-notification-payload";
import { useAuth } from "@/hooks/use-auth";

/**
 * Mensajes FCM en primer plano.
 * - Pestaña visible: solo campana (Socket.IO); no duplicamos toast.
 * - Pestaña en segundo plano / minimizada: notificación del sistema (útil en móvil).
 */
export function PushForegroundHandler() {
  const { isAuthenticated } = useAuth();
  const unsubRef = useRef<(() => void) | null>(null);
  const lastRideOfferSoundRef = useRef<{ rideId: string; at: number } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    (async () => {
      try {
        const messaging = await getMessagingIfSupported();
        if (!messaging || cancelled) return;

        const { onMessage } = await import("firebase/messaging");
        const unsubscribe = onMessage(messaging, (payload) => {
          const parsed = parseFcmNotificationPayload({
            notification: payload.notification,
            data: payload.data as Record<string, string | undefined> | undefined,
          });

          const rideId = String((payload.data as Record<string, string | undefined> | undefined)?.rideId ?? "");
          const offerType = String((payload.data as Record<string, string | undefined> | undefined)?.type ?? "").toLowerCase();
          const isDriverIncomingOffer =
            offerType === "cargo_ride_offer" || offerType === "pack_ride_offer";
          const skipRideOfferSound =
            !isDriverIncomingOffer &&
            parsed.isRideOffer &&
            rideId &&
            lastRideOfferSoundRef.current?.rideId === rideId &&
            Date.now() - (lastRideOfferSoundRef.current?.at ?? 0) < 120_000;

          if ((parsed.isPanic || parsed.isRideOffer) && !skipRideOfferSound && !isDriverIncomingOffer) {
            if (parsed.isRideOffer && rideId) {
              lastRideOfferSoundRef.current = { rideId, at: Date.now() };
            }
            try {
              const Ctx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              if (Ctx) {
                const ctx = new Ctx();
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = parsed.isPanic ? "square" : "sine";
                o.frequency.value = parsed.isPanic ? 880 : 880;
                g.gain.value = parsed.isPanic ? 0.12 : 0.35;
                o.connect(g);
                g.connect(ctx.destination);
                o.start();
                setTimeout(() => {
                  try {
                    o.stop();
                    void ctx.close();
                  } catch {
                    /* ignore */
                  }
                }, parsed.isPanic ? 180 : 280);
              }
            } catch {
              /* ignore */
            }
            try {
              if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
                navigator.vibrate(
                  parsed.isPanic ? [350, 150, 350, 150, 350] : [200, 120, 200, 120, 200, 120, 400],
                );
              }
            } catch {
              /* ignore */
            }
          }

          if (document.hidden && !isDriverIncomingOffer) {
            void showSystemNotification(parsed);
          }
        });
        unsubRef.current = unsubscribe;
      } catch {
        /* messaging no disponible */
      }
    })();

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [isAuthenticated]);

  return null;
}
