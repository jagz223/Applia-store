import { useEffect } from "react";
import { loadGoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { isAndroidInstalledWebApp } from "@/lib/go-driver-bubble-capability";

const DRIVER_PATH = "/go/driver";
const STORAGE_KEY = "genfeb.android.driverPath";

/**
 * APK Android: si el conductor estaba recibiendo y la TWA vuelve a la home,
 * redirige de nuevo a /go/driver.
 */
export function AndroidDriverResumePath() {
  useEffect(() => {
    if (!isAndroidInstalledWebApp()) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;

      const mode = loadGoDriverReceiveMode();
      if (mode === "off") return;

      const path = window.location.pathname;
      if (path === DRIVER_PATH || path.startsWith(`${DRIVER_PATH}/`)) return;

      const isHome = path === "/" || path === "";
      if (!isHome) return;

      let target = DRIVER_PATH;
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved && (saved === DRIVER_PATH || saved.startsWith(`${DRIVER_PATH}/`))) {
          target = saved;
        }
      } catch {
        /* ignore */
      }

      window.location.replace(target);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}

export function rememberAndroidDriverPath(pathname: string): void {
  if (!isAndroidInstalledWebApp()) return;
  if (pathname !== DRIVER_PATH && !pathname.startsWith(`${DRIVER_PATH}/`)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, pathname);
  } catch {
    /* ignore */
  }
}
