import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { isAndroidInstalledWebApp } from "@/lib/go-driver-bubble-capability";

const ANDROID_DRIVER_RECEIVING_URL = "genfeb://driver/receiving";

function androidModeParam(mode: GoDriverReceiveMode): string {
  if (mode === "taxi" || mode === "delivery" || mode === "both") return mode;
  return "both";
}

/** Avisa al APK TWA que inicie o detenga el modo conductor (Fase A burbuja o Fase B overlay). */
export function notifyAndroidDriverReceiving(receiving: boolean, mode: GoDriverReceiveMode = "off"): void {
  if (!isAndroidInstalledWebApp()) return;

  const url = receiving
    ? `${ANDROID_DRIVER_RECEIVING_URL}?on=1&mode=${encodeURIComponent(androidModeParam(mode))}`
    : `${ANDROID_DRIVER_RECEIVING_URL}?on=0`;

  try {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    frame.src = url;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 500);
  } catch {
    try {
      window.location.href = url;
    } catch {
      /* ignore */
    }
  }
}
