import { useEffect, useRef } from "react";
import { getMessagingIfSupported } from "@/lib/firebase-client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Suscribe a mensajes FCM en primer plano.
 * En primer plano no mostramos toast ni notificación extra: Socket.IO ya actualiza
 * la campanita, así evitamos duplicar (1 mensaje = 1 notificación en la campana).
 * El push en segundo plano lo maneja el Service Worker.
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
          const t = payload.data?.type;
          if (t === "go_panic") {
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
        });
        unsubRef.current = unsubscribe;
      } catch {
        // Silently ignore if messaging not supported or onMessage fails
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
