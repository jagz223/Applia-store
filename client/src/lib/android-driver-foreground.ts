import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { isAndroidTwaApp } from "@/lib/go-driver-bubble-capability";

const ANDROID_BRIDGE_ORIGIN = "https://www.genfeb.com/android-driver-bridge";

export const ANDROID_OVERLAY_PENDING_KEY = "genfeb.androidOverlay.pending";
export const ANDROID_BUBBLE_NOTIFY_KEY = "genfeb.androidBubble.notifyUnlocked";
export const ANDROID_OVERLAY_GRANTED_KEY = "genfeb.androidOverlay.granted";

let lastReceivingBridgeKey: string | null = null;

function androidModeParam(mode: GoDriverReceiveMode): string {
  if (mode === "taxi" || mode === "delivery" || mode === "both") return mode;
  return "both";
}

/** Puente silencioso (iframe) sin recargar la página. */
function postAndroidDriverBridge(path: string, query?: Record<string, string>): void {
  try {
    const url = new URL(`${ANDROID_BRIDGE_ORIGIN}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    const frame = document.createElement("iframe");
    frame.style.cssText = "display:none;width:0;height:0;border:0;position:absolute";
    frame.setAttribute("aria-hidden", "true");
    frame.src = url.toString();
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 800);
  } catch {
    /* ignore */
  }
}

/** El APK gestiona visibilidad de la burbuja con el ciclo de vida nativo. */
export function syncAndroidDriverForeground(_visible: boolean): void {
  /* no-op */
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

/** Menú ☰ del conductor en APK: botón «Activar burbuja». */
export function shouldShowAndroidBubbleActivateButton(): boolean {
  return isAndroidTwaApp();
}

/** Avisa al APK que inicie o detenga el overlay nativo (sin recargar la web). */
export function notifyAndroidDriverReceiving(receiving: boolean, mode: GoDriverReceiveMode = "off"): void {
  if (!isAndroidTwaApp()) return;

  const bridgeKey = receiving ? `1:${androidModeParam(mode)}` : "0";
  if (lastReceivingBridgeKey === bridgeKey) return;
  lastReceivingBridgeKey = bridgeKey;

  if (receiving) {
    postAndroidDriverBridge("/receiving", { on: "1", mode: androidModeParam(mode) });
    return;
  }

  postAndroidDriverBridge("/receiving", { on: "0" });
}

export function openAndroidOverlayPermissionSettings(): void {
  if (!isAndroidTwaApp()) return;
  postAndroidDriverBridge("/overlay-permission");
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
  postAndroidDriverBridge("/overlay-check", { return: returnUrl });
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
