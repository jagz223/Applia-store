import { getMessagingIfSupported } from "@/lib/firebase-client";

export type RegisterWebPushResult = {
  ok: boolean;
  token: string | null;
  permission: NotificationPermission | "unsupported";
  error: string | null;
};

const SW_PATH = "/sw.js";
const LEGACY_SW_PATH = "/firebase-messaging-sw.js";
const TOKEN_STORAGE_KEY = "applia_fcm_web_token";

async function getAuthToken(): Promise<string | null> {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

async function unregisterLegacyFcmServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.includes(LEGACY_SW_PATH);
        })
        .map((r) => r.unregister())
    );
  } catch {
    /* ignore */
  }
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  await unregisterLegacyFcmServiceWorkers();

  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active?.scriptURL?.includes(SW_PATH)) {
    return existing;
  }

  return navigator.serviceWorker.register(SW_PATH);
}

async function postTokenToServer(fcmToken: string): Promise<string | null> {
  const authToken = await getAuthToken();
  if (!authToken) {
    return "Inicia sesión para activar las notificaciones.";
  }

  const res = await fetch("/api/notifications/register-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ token: fcmToken, platform: "web" }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return (err as { message?: string }).message || "Error al registrar el dispositivo.";
  }

  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, fcmToken);
  } catch {
    /* ignore */
  }

  return null;
}

export function getStoredFcmToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function registerWebPush(options?: {
  /** Si false, no muestra el prompt del navegador (solo registra con permiso ya concedido). */
  requestPermission?: boolean;
}): Promise<RegisterWebPushResult> {
  const requestPermission = options?.requestPermission !== false;

  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return {
      ok: false,
      token: null,
      permission: "unsupported",
      error: "Notificaciones push no soportadas en este navegador.",
    };
  }

  try {
    let permission = Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      return {
        ok: false,
        token: null,
        permission,
        error:
          permission === "denied"
            ? "Las notificaciones están bloqueadas en el navegador."
            : "Debes permitir las notificaciones en el navegador.",
      };
    }

    const messaging = await getMessagingIfSupported();
    if (!messaging) {
      return {
        ok: false,
        token: null,
        permission,
        error: "Este navegador no soporta Firebase Cloud Messaging.",
      };
    }

    const registration = await ensureServiceWorkerRegistration();
    if (!registration) {
      return {
        ok: false,
        token: null,
        permission,
        error: "No se pudo registrar el Service Worker para notificaciones.",
      };
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey) {
      return {
        ok: false,
        token: null,
        permission,
        error: "Falta VITE_FIREBASE_VAPID_KEY en la configuración.",
      };
    }

    const { getToken } = await import("firebase/messaging");
    const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!fcmToken) {
      return {
        ok: false,
        token: null,
        permission,
        error: "No se pudo obtener el token de notificaciones.",
      };
    }

    const serverError = await postTokenToServer(fcmToken);
    if (serverError) {
      return { ok: false, token: null, permission, error: serverError };
    }

    return { ok: true, token: fcmToken, permission, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al registrar notificaciones push.";
    return {
      ok: false,
      token: null,
      permission: Notification.permission,
      error: msg,
    };
  }
}

export function isWebPushSupported(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}
