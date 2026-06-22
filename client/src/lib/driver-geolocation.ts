import { isLeafletMobileMap } from "@/components/taxi/leaflet-config";

export type DriverGeoPoint = { lat: number; lon: number };

export type DriverGeolocationError = "denied" | "unavailable" | "timeout";

const LAST_KNOWN_KEY = "genfeb.driverGo.lastKnownGeo.v1";
const LAST_KNOWN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readLastKnownDriverGeo(): DriverGeoPoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_KNOWN_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<{ lat: number; lon: number; at: number }>;
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lon)) return null;
    if (Date.now() - (j.at ?? 0) > LAST_KNOWN_MAX_AGE_MS) return null;
    return { lat: j.lat!, lon: j.lon! };
  } catch {
    return null;
  }
}

export function writeLastKnownDriverGeo(p: DriverGeoPoint): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

export function driverGeolocationErrorKind(err: GeolocationPositionError): DriverGeolocationError {
  if (err.code === err.PERMISSION_DENIED) return "denied";
  if (err.code === err.TIMEOUT) return "timeout";
  return "unavailable";
}

export type DriverGeolocationPermissionState = "granted" | "prompt" | "denied" | "unknown";

/** Estado del permiso sin disparar el diálogo (cuando el navegador lo soporta). */
export async function queryDriverGeolocationPermission(): Promise<DriverGeolocationPermissionState> {
  if (typeof navigator.permissions?.query !== "function") return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "granted" || status.state === "prompt" || status.state === "denied") {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

type StartDriverGeolocationWatchOptions = {
  onPosition: (p: DriverGeoPoint) => void;
  onError?: (kind: DriverGeolocationError) => void;
  onLocatingChange?: (locating: boolean) => void;
  /** En móvil, pide permiso solo si aún no está concedido. */
  requestPermissionOnMount?: boolean;
};

/**
 * Un solo watcher para conductor: fix rápido (baja precisión / caché) y luego seguimiento fino.
 */
export function startDriverGeolocationWatch({
  onPosition,
  onError,
  onLocatingChange,
  requestPermissionOnMount = isLeafletMobileMap(),
}: StartDriverGeolocationWatchOptions): () => void {
  if (!navigator.geolocation) {
    onError?.("unavailable");
    onLocatingChange?.(false);
    return () => {};
  }

  let cancelled = false;
  let watchId: number | null = null;

  const apply = (pos: GeolocationPosition) => {
    if (cancelled) return;
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    writeLastKnownDriverGeo(p);
    onPosition(p);
    onLocatingChange?.(false);
  };

  const reportError = (err: GeolocationPositionError) => {
    if (cancelled) return;
    onError?.(driverGeolocationErrorKind(err));
    onLocatingChange?.(false);
  };

  const readPositionSilently = () => {
    onLocatingChange?.(true);
    navigator.geolocation.getCurrentPosition(
      apply,
      () => {
        /* el watch puede recuperar; no marcar error aún */
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    );
  };

  /** Solo cuando el permiso aún no está concedido: puede mostrar el diálogo del sistema. */
  const requestPermissionOrPosition = () => {
    onLocatingChange?.(true);
    navigator.geolocation.getCurrentPosition(
      apply,
      reportError,
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    );
  };

  const startWatch = () => {
    watchId = navigator.geolocation.watchPosition(
      apply,
      () => {
        /* errores transitorios del GPS */
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );
  };

  void (async () => {
    const permission = await queryDriverGeolocationPermission();
    if (cancelled) return;

    if (permission === "denied") {
      onError?.("denied");
      onLocatingChange?.(false);
      return;
    }

    startWatch();

    if (permission === "granted") {
      readPositionSilently();
      return;
    }

    if (requestPermissionOnMount) {
      requestPermissionOrPosition();
      return;
    }

    readPositionSilently();
  })();

  return () => {
    cancelled = true;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
  };
}

/** Reintento manual (botón centrar) o tras denegar y volver a intentar. */
export function requestDriverGeolocationNow(
  onPosition: (p: DriverGeoPoint) => void,
  onError: (kind: DriverGeolocationError) => void,
  onLocatingChange?: (locating: boolean) => void,
): void {
  if (!navigator.geolocation) {
    onError("unavailable");
    onLocatingChange?.(false);
    return;
  }

  onLocatingChange?.(true);

  const finish = (p: DriverGeoPoint) => {
    writeLastKnownDriverGeo(p);
    onPosition(p);
    onLocatingChange?.(false);
  };

  const fail = (err: GeolocationPositionError) => {
    onError(driverGeolocationErrorKind(err));
    onLocatingChange?.(false);
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        fail,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
    },
    { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
  );
}
