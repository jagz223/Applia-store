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

function buildIntentBridgeUrl(path: string, query?: Record<string, string>): string {
  const genfebUrl = buildGenfebBridgeUrl(path, query);
  const withoutScheme = genfebUrl.replace(/^genfeb:\/\//, "");
  return `intent://${withoutScheme}#Intent;scheme=genfeb;package=${GENFEB_TWA_PACKAGE};end`;
}

/**
 * Puente web → APK vía esquema genfeb:// (DriverBridgeActivity).
 * En TWA, iframe/enlace sintético suele bloquearse sin gesto del usuario.
 */
function fireGenfebBridge(path: string, query?: Record<string, string>): void {
  const urls = [buildGenfebBridgeUrl(path, query), buildIntentBridgeUrl(path, query)];
  for (const url of urls) {
    try {
      const link = document.createElement("a");
      link.href = url;
      link.style.cssText = "display:none;position:absolute;width:0;height:0";
      link.setAttribute("aria-hidden", "true");
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => link.remove(), 400);
    } catch {
      /* try next */
    }

    try {
      const frame = document.createElement("iframe");
      frame.style.cssText = "display:none;width:0;height:0;border:0;position:absolute";
      frame.setAttribute("aria-hidden", "true");
      frame.src = url;
      document.body.appendChild(frame);
      window.setTimeout(() => frame.remove(), 800);
    } catch {
      /* try next */
    }
  }
}

function fireGenfebBridgeWithRetry(path: string, query?: Record<string, string>, attempts = 4): void {
  for (let i = 0; i < attempts; i++) {
    window.setTimeout(() => fireGenfebBridge(path, query), i * 500);
  }
}

/** Gesto del usuario (slider, botón): navegación directa, más fiable en TWA. */
function openGenfebBridgeFromUserGesture(path: string, query?: Record<string, string>): void {
  window.location.href = buildGenfebBridgeUrl(path, query);
}

export function syncAndroidDriverForeground(_visible: boolean): void {
  /* no-op: ciclo de vida nativo */
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
  /** true al mover el slider o pulsar un botón (no en useEffect). */
  fromUserGesture?: boolean;
};

/** Inicia o detiene el servicio nativo (notificación + burbuja). */
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
    openGenfebBridgeFromUserGesture("/receiving", {
      on: receiving ? "1" : "0",
      ...(receiving ? { mode: androidModeParam(mode) } : {}),
    });
    return;
  }

  if (receiving) {
    fireGenfebBridgeWithRetry("/receiving", { on: "1", mode: androidModeParam(mode) });
    return;
  }

  fireGenfebBridgeWithRetry("/receiving", { on: "0" });
}

/** Toque del usuario: abre ajustes «mostrar encima de otras apps». */
export function openAndroidOverlayPermissionSettings(): void {
  if (!isAndroidTwaApp()) return;
  openGenfebBridgeFromUserGesture("/overlay-permission");
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
  fireGenfebBridge("/overlay-check", { return: returnUrl });
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
