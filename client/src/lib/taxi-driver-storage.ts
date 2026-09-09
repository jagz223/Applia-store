/**
 * Estado local del conductor (viajes completados en este dispositivo).
 * El historial va por cuenta (`user.id`): no se mezcla con el del pasajero ni entre conductores.
 */

export const TAXI_DRIVER_RECEIVING_KEY = "taxi-driver-receiving";
export const PACK_DRIVER_RECEIVING_KEY = "pack-driver-receiving";
/** Modo unificado: `off` | `taxi` | `delivery` (vista `/go/driver`). */
export const GO_DRIVER_RECEIVE_MODE_KEY = "go-driver-receive-mode";

export type GoDriverReceiveMode = "off" | "taxi" | "delivery" | "both";
/** Prefijo base; las entradas efectivas son `taxi-driver-trip-log:user:<id>` o `:guest`. */
export const TAXI_DRIVER_TRIP_LOG_KEY = "taxi-driver-trip-log";
/** Viaje Transporte activo (matched / in_progress) para reanudar al reabrir la app. */
export const TAXI_DRIVER_ACTIVE_RIDE_KEY = "taxi-driver-active-ride-id";
export const PACK_DRIVER_ACTIVE_RIDE_KEY = "pack-driver-active-ride-id";

export type TaxiDriverTripLog = {
  id: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: "applia" | "cash" | "bank_transfer";
  /** Módulo Go: transport (Transporte) o delivery (envíos). */
  goSlug?: "taxi" | "pack";
  outcome?: "completed" | "cancelled" | "expired";
  statusLabel?: string;
  destinationPending?: boolean;
};

export function loadReceiving(): boolean {
  try {
    return localStorage.getItem(TAXI_DRIVER_RECEIVING_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveReceiving(on: boolean): void {
  try {
    localStorage.setItem(TAXI_DRIVER_RECEIVING_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadGoReceiving(goSlug: "taxi" | "pack"): boolean {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_RECEIVING_KEY : TAXI_DRIVER_RECEIVING_KEY;
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function saveGoReceiving(goSlug: "taxi" | "pack", on: boolean): void {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_RECEIVING_KEY : TAXI_DRIVER_RECEIVING_KEY;
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadGoDriverReceiveMode(): GoDriverReceiveMode {
  try {
    const v = localStorage.getItem(GO_DRIVER_RECEIVE_MODE_KEY);
    if (v === "off" || v === "taxi" || v === "delivery" || v === "both") return v;
    const taxiReceiving = localStorage.getItem(TAXI_DRIVER_RECEIVING_KEY) === "1";
    const pack = localStorage.getItem(PACK_DRIVER_RECEIVING_KEY) === "1";
    if (taxiReceiving && pack) return "both";
    if (taxiReceiving && !pack) return "taxi";
    if (pack && !taxiReceiving) return "delivery";
    return "off";
  } catch {
    return "off";
  }
}

export function saveGoDriverReceiveMode(mode: GoDriverReceiveMode): void {
  try {
    localStorage.setItem(GO_DRIVER_RECEIVE_MODE_KEY, mode);
    saveGoReceiving("taxi", mode === "taxi" || mode === "both");
    saveGoReceiving("pack", mode === "delivery" || mode === "both");
  } catch {
    /* ignore */
  }
}

/** Apaga taxi y delivery en localStorage (p. ej. al perder el socket por reinicio del servidor). */
export function clearAllGoReceiving(): void {
  saveGoDriverReceiveMode("off");
}

export function loadDriverActiveRideId(): string | null {
  try {
    const v = localStorage.getItem(TAXI_DRIVER_ACTIVE_RIDE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveDriverActiveRideId(rideId: string): void {
  try {
    localStorage.setItem(TAXI_DRIVER_ACTIVE_RIDE_KEY, rideId);
  } catch {
    /* ignore */
  }
}

export function clearDriverActiveRideId(): void {
  try {
    localStorage.removeItem(TAXI_DRIVER_ACTIVE_RIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadGoDriverActiveRideId(goSlug: "taxi" | "pack"): string | null {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_ACTIVE_RIDE_KEY : TAXI_DRIVER_ACTIVE_RIDE_KEY;
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveGoDriverActiveRideId(goSlug: "taxi" | "pack", rideId: string): void {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_ACTIVE_RIDE_KEY : TAXI_DRIVER_ACTIVE_RIDE_KEY;
    localStorage.setItem(key, rideId);
  } catch {
    /* ignore */
  }
}

export function clearGoDriverActiveRideId(goSlug: "taxi" | "pack"): void {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_ACTIVE_RIDE_KEY : TAXI_DRIVER_ACTIVE_RIDE_KEY;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function hasGoDriverActiveRide(): boolean {
  return !!(loadGoDriverActiveRideId("taxi") || loadGoDriverActiveRideId("pack"));
}

function normalizeAccountId(accountId: string | null | undefined): string | null {
  if (typeof accountId !== "string") return null;
  const t = accountId.trim();
  return t.length > 0 ? t : null;
}

/** Clave de localStorage para el historial del conductor (una por usuario autenticado). */
export function driverTripLogStorageKey(accountId: string | null | undefined): string {
  const id = normalizeAccountId(accountId);
  return id ? `${TAXI_DRIVER_TRIP_LOG_KEY}:user:${id}` : `${TAXI_DRIVER_TRIP_LOG_KEY}:guest`;
}

function parseTripLogRaw(raw: string | null): TaxiDriverTripLog[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is TaxiDriverTripLog =>
        t != null &&
        typeof t === "object" &&
        typeof (t as TaxiDriverTripLog).id === "string" &&
        typeof (t as TaxiDriverTripLog).durationMin === "number" &&
        typeof (t as TaxiDriverTripLog).amountUsd === "number" &&
        ((t as TaxiDriverTripLog).payment === "applia" ||
          (t as TaxiDriverTripLog).payment === "cash" ||
          (t as TaxiDriverTripLog).payment === "bank_transfer") &&
        ((t as TaxiDriverTripLog).goSlug === undefined ||
          (t as TaxiDriverTripLog).goSlug === "taxi" ||
          (t as TaxiDriverTripLog).goSlug === "pack" ||
          typeof (t as TaxiDriverTripLog).goSlug === "string")
    );
  } catch {
    return [];
  }
}

/**
 * Historial de viajes completados como conductor para la cuenta indicada.
 * No usa el mismo almacén que el pasajero (`taxi-rider-trip-log`).
 */
export function loadTripLog(accountId?: string | null): TaxiDriverTripLog[] {
  try {
    const key = driverTripLogStorageKey(accountId ?? null);
    let rows = parseTripLogRaw(localStorage.getItem(key));
    /**
     * Compat: clave única antigua `taxi-driver-trip-log`. La primera carga la mueve al bucket activo
     * (usuario o invitado). En un mismo navegador suele haber un conductor habitual.
     */
    // Importante: si hay `accountId` autenticado, NO migramos el legacy global para evitar mezclar
    // historiales entre cuentas en un mismo dispositivo.
    if (rows.length === 0 && normalizeAccountId(accountId ?? null) == null) {
      const legacy = parseTripLogRaw(localStorage.getItem(TAXI_DRIVER_TRIP_LOG_KEY));
      if (legacy.length > 0) {
        try {
          localStorage.setItem(key, JSON.stringify(legacy));
          localStorage.removeItem(TAXI_DRIVER_TRIP_LOG_KEY);
        } catch {
          /* ignore */
        }
        rows = legacy;
      }
    }
    return rows;
  } catch {
    return [];
  }
}

export function appendDriverTripLog(entry: TaxiDriverTripLog, accountId?: string | null): void {
  try {
    const key = driverTripLogStorageKey(accountId ?? null);
    const cur = parseTripLogRaw(localStorage.getItem(key));
    const next = [entry, ...cur.filter((t) => t.id !== entry.id)].slice(0, 30);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
