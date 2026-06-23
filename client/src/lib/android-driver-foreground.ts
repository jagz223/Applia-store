import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { isAndroidInstalledWebApp } from "@/lib/go-driver-bubble-capability";

const ANDROID_DRIVER_RECEIVING_URL = "genfeb://driver/receiving";
const ANDROID_OVERLAY_PERMISSION_URL = "genfeb://driver/overlay-permission";
const ANDROID_OVERLAY_CHECK_URL = "genfeb://driver/overlay-check";

export const ANDROID_OVERLAY_PENDING_KEY = "genfeb.androidOverlay.pending";

function openAndroidDriverDeepLink(url: string, options?: { navigate?: boolean }): void {
  if (options?.navigate) {
    try {
      window.location.assign(url);
      return;
    } catch {
      /* fallback iframe */
    }
  }

  try {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    frame.src = url;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 500);
  } catch {
    try {
      window.location.assign(url);
    } catch {
      /* ignore */
    }
  }
}

function androidModeParam(mode: GoDriverReceiveMode): string {
  if (mode === "taxi" || mode === "delivery" || mode === "both") return mode;
  return "both";
}

/** Avisa al APK TWA que inicie o detenga el modo conductor (overlay nativo). */
export function notifyAndroidDriverReceiving(receiving: boolean, mode: GoDriverReceiveMode = "off"): void {
  if (!isAndroidInstalledWebApp()) return;

  const url = receiving
    ? `${ANDROID_DRIVER_RECEIVING_URL}?on=1&mode=${encodeURIComponent(androidModeParam(mode))}`
    : `${ANDROID_DRIVER_RECEIVING_URL}?on=0`;

  openAndroidDriverDeepLink(url);
}

/** Abre ajustes del sistema para permitir «mostrar encima de otras apps». */
export function openAndroidOverlayPermissionSettings(): void {
  if (!isAndroidInstalledWebApp()) return;
  openAndroidDriverDeepLink(ANDROID_OVERLAY_PERMISSION_URL, { navigate: true });
}

/**
 * Menú conductor: marca pendiente y abre ajustes de overlay (sin depender de «Recibir servicios»).
 */
export function requestAndroidOverlayPermissionForDriver(): void {
  if (!isAndroidInstalledWebApp()) return;
  try {
    sessionStorage.setItem(ANDROID_OVERLAY_PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
  openAndroidOverlayPermissionSettings();
}

/** Tras volver de ajustes, el APK comprueba el permiso y devuelve el resultado en la URL. */
export function checkAndroidOverlayPermissionAfterReturn(): void {
  if (!isAndroidInstalledWebApp()) return;
  try {
    if (sessionStorage.getItem(ANDROID_OVERLAY_PENDING_KEY) !== "1") return;
  } catch {
    return;
  }

  const returnUrl = encodeURIComponent(window.location.href.split("#")[0]);
  openAndroidDriverDeepLink(`${ANDROID_OVERLAY_CHECK_URL}?return=${returnUrl}`);
}

export type AndroidOverlayPermissionResult = "granted" | "denied";

/** Lee y limpia `?androidOverlay=` de la URL tras la comprobación nativa. */
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

  return value;
}
