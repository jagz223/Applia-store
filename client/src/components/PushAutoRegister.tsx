import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { registerWebPush } from "@/lib/register-web-push";

const AUTO_REGISTER_DELAY_MS = 1500;
const SESSION_ATTEMPT_KEY = "genfeb_push_auto_register_attempted";

/**
 * Tras iniciar sesión, pide permiso (si aún no se decidió) y registra el token FCM web.
 */
export function PushAutoRegister() {
  const { isAuthenticated, isLoading } = useAuth();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (attemptedRef.current) return;
    if (typeof Notification === "undefined") return;

    const permission = Notification.permission;
    if (permission === "denied") return;

    try {
      if (sessionStorage.getItem(SESSION_ATTEMPT_KEY) === "1") {
        attemptedRef.current = true;
        return;
      }
    } catch {
      /* ignore */
    }

    attemptedRef.current = true;

    const timer = window.setTimeout(() => {
      void registerWebPush({
        requestPermission: permission === "default",
      }).finally(() => {
        try {
          sessionStorage.setItem(SESSION_ATTEMPT_KEY, "1");
        } catch {
          /* ignore */
        }
      });
    }, AUTO_REGISTER_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  return null;
}
