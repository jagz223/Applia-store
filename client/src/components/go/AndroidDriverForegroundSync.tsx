import { useEffect } from "react";
import { syncAndroidDriverForeground } from "@/lib/android-driver-foreground";
import { isAndroidInstalledWebApp } from "@/lib/go-driver-bubble-capability";

/** APK Android: informa al overlay nativo si la web está visible (oculta burbuja dentro de la app). */
export function AndroidDriverForegroundSync() {
  useEffect(() => {
    if (!isAndroidInstalledWebApp()) return;

    const sync = () => {
      syncAndroidDriverForeground(document.visibilityState === "visible");
    };
    const onPageHide = () => syncAndroidDriverForeground(false);

    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", sync);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", sync);
    };
  }, []);

  return null;
}
