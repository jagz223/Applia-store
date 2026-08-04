/**
 * Estado local del conductor (viajes completados en este dispositivo).
 * El historial va por cuenta (`user.id`): no se mezcla con el del pasajero ni entre conductores.
 */

export const CARGO_DRIVER_RECEIVING_KEY = "cargo-driver-receiving";
export const PACK_DRIVER_RECEIVING_KEY = "pack-driver-receiving";
/** Modo unificado: `off` | `taxi` | `delivery` (vista `/go/driver`). */
export const GO_DRIVER_RECEIVE_MODE_KEY = "go-driver-receive-mode";

export type GoDriverReceiveMode = "off" | "taxi" | "delivery" | "both";
/** Prefijo base; las entradas efectivas son `cargo-driver-trip-log:user:<id>` o `:guest`. */
export const CARGO_DRIVER_TRIP_LOG_KEY = "cargo-driver-trip-log";
/** Viaje Car Go activo (matched / in_progress) para reanudar al reabrir la app. */
export const CARGO_DRIVER_ACTIVE_RIDE_KEY = "cargo-driver-active-ride-id";
export const PACK_DRIVER_ACTIVE_RIDE_KEY = "pack-driver-active-ride-id";

export type CargoDriverTripLog = {
  id: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: "applia" | "cash" | "bank_transfer";
  /** Módulo Go: transport (Car Go) o delivery (Pack Go). */
  goSlug?: "cargo" | "pack";
  outcome?: "completed" | "cancelled" | "expired";
  statusLabel?: string;
  destinationPending?: boolean;
};

export function loadReceiving(): boolean {
  try {
    return localStorage.getItem(CARGO_DRIVER_RECEIVING_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveReceiving(on: boolean): void {
  try {
    localStorage.setItem(CARGO_DRIVER_RECEIVING_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadGoReceiving(goSlug: "cargo" | "pack"): boolean {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_RECEIVING_KEY : CARGO_DRIVER_RECEIVING_KEY;
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function saveGoReceiving(goSlug: "cargo" | "pack", on: boolean): void {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_RECEIVING_KEY : CARGO_DRIVER_RECEIVING_KEY;
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadGoDriverReceiveMode(): GoDriverReceiveMode {
  try {
    const v = localStorage.getItem(GO_DRIVER_RECEIVE_MODE_KEY);
    if (v === "off" || v === "taxi" || v === "delivery" || v === "both") return v;
    const cargo = localStorage.getItem(CARGO_DRIVER_RECEIVING_KEY) === "1";
    const pack = localStorage.getItem(PACK_DRIVER_RECEIVING_KEY) === "1";
    if (cargo && pack) return "both";
    if (cargo && !pack) return "taxi";
    if (pack && !cargo) return "delivery";
    return "off";
  } catch {
    return "off";
  }
}

export function saveGoDriverReceiveMode(mode: GoDriverReceiveMode): void {
  try {
    localStorage.setItem(GO_DRIVER_RECEIVE_MODE_KEY, mode);
    saveGoReceiving("cargo", mode === "taxi" || mode === "both");
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
    const v = localStorage.getItem(CARGO_DRIVER_ACTIVE_RIDE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveDriverActiveRideId(rideId: string): void {
  try {
    localStorage.setItem(CARGO_DRIVER_ACTIVE_RIDE_KEY, rideId);
  } catch {
    /* ignore */
  }
}

export function clearDriverActiveRideId(): void {
  try {
    localStorage.removeItem(CARGO_DRIVER_ACTIVE_RIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadGoDriverActiveRideId(goSlug: "cargo" | "pack"): string | null {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_ACTIVE_RIDE_KEY : CARGO_DRIVER_ACTIVE_RIDE_KEY;
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveGoDriverActiveRideId(goSlug: "cargo" | "pack", rideId: string): void {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_ACTIVE_RIDE_KEY : CARGO_DRIVER_ACTIVE_RIDE_KEY;
    localStorage.setItem(key, rideId);
  } catch {
    /* ignore */
  }
}

export function clearGoDriverActiveRideId(goSlug: "cargo" | "pack"): void {
  try {
    const key = goSlug === "pack" ? PACK_DRIVER_ACTIVE_RIDE_KEY : CARGO_DRIVER_ACTIVE_RIDE_KEY;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function hasGoDriverActiveRide(): boolean {
  return !!(loadGoDriverActiveRideId("cargo") || loadGoDriverActiveRideId("pack"));
}

function normalizeAccountId(accountId: string | null | undefined): string | null {
  if (typeof accountId !== "string") return null;
  const t = accountId.trim();
  return t.length > 0 ? t : null;
}

/** Clave de localStorage para el historial del conductor (una por usuario autenticado). */
export function driverTripLogStorageKey(accountId: string | null | undefined): string {
  const id = normalizeAccountId(accountId);
  return id ? `${CARGO_DRIVER_TRIP_LOG_KEY}:user:${id}` : `${CARGO_DRIVER_TRIP_LOG_KEY}:guest`;
}

function parseTripLogRaw(raw: string | null): CargoDriverTripLog[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CargoDriverTripLog =>
        t != null &&
        typeof t === "object" &&
        typeof (t as CargoDriverTripLog).id === "string" &&
        typeof (t as CargoDriverTripLog).durationMin === "number" &&
        typeof (t as CargoDriverTripLog).amountUsd === "number" &&
        ((t as CargoDriverTripLog).payment === "applia" ||
          (t as CargoDriverTripLog).payment === "cash" ||
          (t as CargoDriverTripLog).payment === "bank_transfer") &&
        ((t as CargoDriverTripLog).goSlug === undefined ||
          (t as CargoDriverTripLog).goSlug === "cargo" ||
          (t as CargoDriverTripLog).goSlug === "pack")
    );
  } catch {
    return [];
  }
}

/**
 * Historial de viajes completados como conductor para la cuenta indicada.
 * No usa el mismo almacén que el pasajero (`cargo-rider-trip-log`).
 */
export function loadTripLog(accountId?: string | null): CargoDriverTripLog[] {
  try {
    const key = driverTripLogStorageKey(accountId ?? null);
    let rows = parseTripLogRaw(localStorage.getItem(key));
    /**
     * Compat: clave única antigua `cargo-driver-trip-log`. La primera carga la mueve al bucket activo
     * (usuario o invitado). En un mismo navegador suele haber un conductor habitual.
     */
    // Importante: si hay `accountId` autenticado, NO migramos el legacy global para evitar mezclar
    // historiales entre cuentas en un mismo dispositivo.
    if (rows.length === 0 && normalizeAccountId(accountId ?? null) == null) {
      const legacy = parseTripLogRaw(localStorage.getItem(CARGO_DRIVER_TRIP_LOG_KEY));
      if (legacy.length > 0) {
        try {
          localStorage.setItem(key, JSON.stringify(legacy));
          localStorage.removeItem(CARGO_DRIVER_TRIP_LOG_KEY);
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

export function appendDriverTripLog(entry: CargoDriverTripLog, accountId?: string | null): void {
  try {
    const key = driverTripLogStorageKey(accountId ?? null);
    const cur = parseTripLogRaw(localStorage.getItem(key));
    const next = [entry, ...cur.filter((t) => t.id !== entry.id)].slice(0, 30);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
