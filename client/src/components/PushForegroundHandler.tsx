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
        const unsubscribe = onMessage(messaging, () => {
          // Solo mantener la suscripción activa; la campanita se actualiza por Socket.IO.
          // No mostrar toast para no duplicar con la notificación que ya añade el socket.
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
