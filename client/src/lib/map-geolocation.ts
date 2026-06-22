import { useEffect } from "react";
import {
  driverGeolocationErrorKind,
  queryDriverGeolocationPermission,
  writeLastKnownDriverGeo,
  type DriverGeolocationPermissionState,
} from "@/lib/driver-geolocation";
import { isLeafletMobileMap } from "@/components/taxi/leaflet-config";
import { isAndroidMobile } from "@/lib/go-driver-bubble-capability";

function warmupGeolocationCache(): void {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => writeLastKnownDriverGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => {
      /* sin fix aún */
    },
    { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
  );
}

/**
 * En pantallas con mapa: comprueba el permiso de ubicación y, si aún no se decidió,
 * dispara el diálogo del sistema (sin molestar si ya está concedido o denegado).
 */
export async function ensureMapGeolocationPermission(): Promise<DriverGeolocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "unknown";
  }

  const permission = await queryDriverGeolocationPermission();
  if (permission === "granted") {
    warmupGeolocationCache();
    return "granted";
  }
  if (permission === "denied") {
    return "denied";
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        writeLastKnownDriverGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        resolve("granted");
      },
      (err) => {
        const kind = driverGeolocationErrorKind(err);
        resolve(kind === "denied" ? "denied" : "unknown");
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    );
  });
}

/**
 * Al abrir la app en Android: pide GPS si falta; si ya está concedido solo actualiza la caché.
 */
export async function bootstrapAppGeolocationPermission(): Promise<DriverGeolocationPermissionState> {
  if (!isAndroidMobile() || typeof navigator === "undefined" || !navigator.geolocation) {
    return "unknown";
  }

  const permission = await queryDriverGeolocationPermission();
  if (permission === "granted") {
    warmupGeolocationCache();
    return "granted";
  }
  if (permission === "denied") {
    return "denied";
  }

  return ensureMapGeolocationPermission();
}

/** Hook para montar en componentes que muestran mapa en móvil. */
export function useEnsureMapGeolocation(): void {
  useEffect(() => {
    if (!isLeafletMobileMap() && !isAndroidMobile()) return;
    void ensureMapGeolocationPermission();
  }, []);
}
