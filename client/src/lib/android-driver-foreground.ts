import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { isAndroidTwaApp } from "@/lib/go-driver-bubble-capability";

const GENFEB_DRIVER_BRIDGE = "genfeb://driver";
const GENFEB_TWA_PACKAGE = "com.genfeb.www.twa";

export const ANDROID_OVERLAY_PENDING_KEY = "genfeb.androidOverlay.pending";
export const ANDROID_BUBBLE_NOTIFY_KEY = "genfeb.androidBubble.notifyUnlocked";
export const ANDROID_OVERLAY_GRANTED_KEY = "genfeb.androidOverlay.granted";

let lastReceivingBridgeKey: string | null = null;

function androidModeParam(mode: GoDriverReceiveMode): string {
  if (mode === "taxi" || mode === "delivery" || mode === "both") return mode;
  return "both";
}

function buildGenfebBridgeUrl(path: string, query?: Record<string, string>): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${GENFEB_DRIVER_BRIDGE}${normalized}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/** Intent explícito al mismo APK: evita el diálogo «¿Continuar a Genfeb?». */
function buildSameAppIntentUrl(path: string, query?: Record<string, string>): string {
  const genfebUrl = buildGenfebBridgeUrl(path, query);
  const withoutScheme = genfebUrl.replace(/^genfeb:\/\//, "");
  const fallback = encodeURIComponent(
    typeof window !== "undefined" ? window.location.href.split("#")[0] : "https://www.genfeb.com/go/driver",
  );
  return `intent://${withoutScheme}#Intent;scheme=genfeb;package=${GENFEB_TWA_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

/** Un solo disparo silencioso (p. ej. apagar servicio). */
function fireGenfebBridgeOnce(path: string, query?: Record<string, string>): void {
  const url = buildSameAppIntentUrl(path, query);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.style.cssText = "display:none;position:absolute;width:0;height:0";
    link.setAttribute("aria-hidden", "true");
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 400);
  } catch {
    /* ignore */
  }
}

/** Gesto del usuario: intent directo al paquete TWA (sin recargar https). */
function openBridgeFromUserGesture(path: string, query?: Record<string, string>): void {
  window.location.href = buildSameAppIntentUrl(path, query);
}

export function syncAndroidDriverForeground(_visible: boolean): void {
  /* ciclo de vida nativo (TAB_HIDDEN / onTrimMemory) */
}

export function markAndroidOverlayGranted(granted: boolean): void {
  try {
    if (granted) {
      localStorage.setItem(ANDROID_OVERLAY_GRANTED_KEY, "1");
    } else {
      localStorage.removeItem(ANDROID_OVERLAY_GRANTED_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function unlockAndroidBubbleMenuFromUrl(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get("androidBubbleNotify") !== "1") return false;

  params.delete("androidBubbleNotify");
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next);
  try {
    localStorage.setItem(ANDROID_BUBBLE_NOTIFY_KEY, "1");
  } catch {
    /* ignore */
  }
  return true;
}

export function shouldShowAndroidBubbleActivateButton(): boolean {
  return isAndroidTwaApp();
}

type AndroidDriverReceivingOptions = {
  fromUserGesture?: boolean;
};

/**
 * Inicia o detiene el servicio nativo (notificación + burbuja).
 * Al activar «recibir», el APK restaura el servicio solo; aquí solo hace falta
 * el puente en gesto del usuario o al apagar.
 */
export function notifyAndroidDriverReceiving(
  receiving: boolean,
  mode: GoDriverReceiveMode = "off",
  options?: AndroidDriverReceivingOptions,
): void {
  if (!isAndroidTwaApp()) return;

  const bridgeKey = receiving ? `1:${androidModeParam(mode)}` : "0";
  if (!options?.fromUserGesture && lastReceivingBridgeKey === bridgeKey) return;
  lastReceivingBridgeKey = bridgeKey;

  if (options?.fromUserGesture) {
    openBridgeFromUserGesture("/receiving", {
      on: receiving ? "1" : "0",
      ...(receiving ? { mode: androidModeParam(mode) } : {}),
    });
    return;
  }

  if (!receiving) {
    fireGenfebBridgeOnce("/receiving", { on: "0" });
  }
}

export function openAndroidOverlayPermissionSettings(): void {
  if (!isAndroidTwaApp()) return;
  openBridgeFromUserGesture("/overlay-permission");
}

export function requestAndroidOverlayPermissionForDriver(): void {
  if (!isAndroidTwaApp()) return;
  try {
    sessionStorage.setItem(ANDROID_OVERLAY_PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
  openAndroidOverlayPermissionSettings();
}

export function checkAndroidOverlayPermissionAfterReturn(): void {
  if (!isAndroidTwaApp()) return;
  try {
    if (sessionStorage.getItem(ANDROID_OVERLAY_PENDING_KEY) !== "1") return;
  } catch {
    return;
  }

  const returnUrl = window.location.href.split("#")[0];
  fireGenfebBridgeOnce("/overlay-check", { return: returnUrl });
}

export type AndroidOverlayPermissionResult = "granted" | "denied";

export function consumeAndroidOverlayResult(): AndroidOverlayPermissionResult | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const value = params.get("androidOverlay");
  if (value !== "granted" && value !== "denied") return null;

  params.delete("androidOverlay");
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next);

  try {
    sessionStorage.removeItem(ANDROID_OVERLAY_PENDING_KEY);
  } catch {
    /* ignore */
  }

  markAndroidOverlayGranted(value === "granted");

  return value;
}
