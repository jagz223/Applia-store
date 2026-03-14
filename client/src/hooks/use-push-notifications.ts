import { useCallback, useEffect, useState } from "react";
import { getMessagingIfSupported } from "@/lib/firebase-client";

type PushPermission = NotificationPermission | "unsupported";

type RegistrationState = {
  permission: PushPermission;
  token: string | null;
  isSupported: boolean;
  isRegistering: boolean;
  error: string | null;
  register: () => Promise<void>;
};

async function getAuthToken(): Promise<string | null> {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    return registration;
  } catch {
    return null;
  }
}

export function usePushNotifications(): RegistrationState {
  const [permission, setPermission] = useState<PushPermission>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [token, setToken] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(() => typeof window !== "undefined");

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setIsSupported(false);
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const register = useCallback(async () => {
    setError(null);

    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setIsSupported(false);
      setPermission("unsupported");
      setError("Notificaciones push no soportadas en este navegador.");
      return;
    }

    try {
      setIsRegistering(true);
      let currentPermission = Notification.permission;
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
      }
      setPermission(currentPermission);

      if (currentPermission !== "granted") {
        setError("Debes permitir las notificaciones en el navegador.");
        return;
      }

      const messaging = await getMessagingIfSupported();
      if (!messaging) {
        setIsSupported(false);
        setError("Este navegador no soporta Firebase Cloud Messaging.");
        return;
      }

      const registration = await registerServiceWorker();
      if (!registration) {
        setError("No se pudo registrar el Service Worker para notificaciones.");
        return;
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
      if (!vapidKey) {
        setError("Falta VITE_FIREBASE_VAPID_KEY en la configuración.");
        return;
      }

      const { getToken } = await import("firebase/messaging");
      const fcmToken = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!fcmToken) {
        setError("No se pudo obtener el token de notificaciones.");
        return;
      }

      const authToken = await getAuthToken();
      const res = await fetch("/api/notifications/register-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ token: fcmToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { message?: string }).message || "Error al registrar el dispositivo.");
        return;
      }

      setToken(fcmToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al registrar notificaciones push.";
      setError(msg);
    } finally {
      setIsRegistering(false);
    }
  }, []);

  return {
    permission,
    token,
    isSupported,
    isRegistering,
    error,
    register,
  };
}

