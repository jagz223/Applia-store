import { useEffect } from "react";
import { bootstrapAppGeolocationPermission } from "@/lib/map-geolocation";
import { isAndroidMobile } from "@/lib/go-driver-bubble-capability";

const BOOTSTRAP_DELAY_MS = 800;

/**
 * Android: al abrir la app solicita permiso de ubicación (GPS) si aún no está concedido.
 * Si ya lo tiene, solo calienta la última posición conocida. Al volver de segundo plano revalida.
 */
export function AndroidGeolocationBootstrap() {
  useEffect(() => {
    if (!isAndroidMobile()) return;

    const run = () => {
      void bootstrapAppGeolocationPermission();
    };

    const timer = window.setTimeout(run, BOOTSTRAP_DELAY_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
