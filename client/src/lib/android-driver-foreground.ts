import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { isAndroidTwaApp } from "@/lib/go-driver-bubble-capability";

const NATIVE_RECEIVING_PARAM = "genfebNativeReceiving";
const NATIVE_MODE_PARAM = "genfebNativeMode";
const NATIVE_OVERLAY_PARAM = "genfebNativeOverlay";
const NATIVE_RETURN_PARAM = "genfebNativeReturn";
const NATIVE_FOREGROUND_PARAM = "genfebNativeForeground";
const NATIVE_SYNC_STORAGE_KEY = "genfeb.android.nativeReceivingSync";

export const ANDROID_OVERLAY_PENDING_KEY = "genfeb.androidOverlay.pending";
export const ANDROID_BUBBLE_NOTIFY_KEY = "genfeb.androidBubble.notifyUnlocked";
export const ANDROID_OVERLAY_GRANTED_KEY = "genfeb.androidOverlay.granted";

function androidModeParam(mode: GoDriverReceiveMode): string {
  if (mode === "taxi" || mode === "delivery" || mode === "both") return mode;
  return "both";
}

function readNativeSyncKey(): string | null {
  try {
    return sessionStorage.getItem(NATIVE_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeNativeSyncKey(key: string): void {
  try {
    sessionStorage.setItem(NATIVE_SYNC_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

/**
 * Comando nativo vía query en la misma URL de la TWA (sin genfeb:// ni iframes).
 * LauncherActivity procesa los parámetros y recarga /go/driver limpio.
 */
function navigateWithNativeParams(params: Record<string, string>): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(NATIVE_RECEIVING_PARAM);
  url.searchParams.delete(NATIVE_MODE_PARAM);
  url.searchParams.delete(NATIVE_OVERLAY_PARAM);
  url.searchParams.delete(NATIVE_RETURN_PARAM);
  url.searchParams.delete(NATIVE_FOREGROUND_PARAM);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  window.location.replace(url.toString());
}

/** Sin web bridge: el ciclo de vida nativo oculta/muestra la burbuja. */
export function syncAndroidDriverForeground(_visible: boolean): void {
  /* no-op */
}

function readAndroidOverlayGrantedFromStorage(): boolean {
  try {
    return localStorage.getItem(ANDROID_OVERLAY_GRANTED_KEY) === "1";
  } catch {
    return false;
  }
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

export function isAndroidBubbleMenuUnlocked(): boolean {
  try {
    return localStorage.getItem(ANDROID_BUBBLE_NOTIFY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Menú ☰: «Activar burbuja» siempre visible en el APK (abre ajustes de overlay). */
export function shouldShowAndroidBubbleActivateButton(): boolean {
  return isAndroidTwaApp();
}

/** Avisa al APK que inicie o detenga el overlay nativo. */
export function notifyAndroidDriverReceiving(receiving: boolean, mode: GoDriverReceiveMode = "off"): void {
  if (!isAndroidTwaApp()) return;

  const syncKey = receiving ? `1:${androidModeParam(mode)}` : "0";
  if (readNativeSyncKey() === syncKey) return;
  writeNativeSyncKey(syncKey);

  if (receiving) {
    try {
      localStorage.setItem(ANDROID_BUBBLE_NOTIFY_KEY, "1");
    } catch {
      /* ignore */
    }
    navigateWithNativeParams({
      [NATIVE_RECEIVING_PARAM]: "1",
      [NATIVE_MODE_PARAM]: androidModeParam(mode),
    });
    return;
  }

  navigateWithNativeParams({ [NATIVE_RECEIVING_PARAM]: "0" });
}

export function openAndroidOverlayPermissionSettings(): void {
  if (!isAndroidTwaApp()) return;
  navigateWithNativeParams({ [NATIVE_OVERLAY_PARAM]: "permission" });
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
  navigateWithNativeParams({
    [NATIVE_OVERLAY_PARAM]: "check",
    [NATIVE_RETURN_PARAM]: returnUrl,
  });
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
