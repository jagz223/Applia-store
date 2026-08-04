import { useEffect } from "react";
import { isAndroidTwaApp } from "@/lib/go-driver-bubble-capability";

const HTML_CLASS = "applia-android-twa";

/**
 * Reduce «Buscar con Google» al tocar texto en Chrome TWA (no lo desactiva al 100%).
 */
export function TwaTouchGuard() {
  useEffect(() => {
    if (!isAndroidTwaApp()) return;
    const root = document.documentElement;
    root.classList.add(HTML_CLASS);
    return () => root.classList.remove(HTML_CLASS);
  }, []);

  return null;
}
