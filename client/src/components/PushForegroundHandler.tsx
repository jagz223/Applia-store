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

          if (parsed.isPanic) {
            try {
              const Ctx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              if (Ctx) {
                const ctx = new Ctx();
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = "square";
                o.frequency.value = 880;
                g.gain.value = 0.12;
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
                }, 180);
              }
            } catch {
              /* ignore */
            }
            try {
              if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
                navigator.vibrate([350, 150, 350, 150, 350]);
              }
            } catch {
              /* ignore */
            }
          }

          if (document.hidden) {
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
