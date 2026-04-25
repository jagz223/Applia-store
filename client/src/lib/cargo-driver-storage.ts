/** Estado local del conductor Car Go hasta que exista API dedicada. */

export const CARGO_DRIVER_RECEIVING_KEY = "cargo-driver-receiving";
export const CARGO_DRIVER_TRIP_LOG_KEY = "cargo-driver-trip-log";
/** Viaje Car Go activo (matched / in_progress) para reanudar al reabrir la app. */
export const CARGO_DRIVER_ACTIVE_RIDE_KEY = "cargo-driver-active-ride-id";

export type CargoDriverTripLog = {
  id: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: "genfeb" | "cash";
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

export function loadTripLog(): CargoDriverTripLog[] {
  try {
    const raw = localStorage.getItem(CARGO_DRIVER_TRIP_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CargoDriverTripLog =>
        t != null &&
        typeof t === "object" &&
        typeof (t as CargoDriverTripLog).id === "string" &&
        typeof (t as CargoDriverTripLog).durationMin === "number" &&
        typeof (t as CargoDriverTripLog).amountUsd === "number" &&
        ((t as CargoDriverTripLog).payment === "genfeb" || (t as CargoDriverTripLog).payment === "cash")
    );
  } catch {
    return [];
  }
}

export function appendDriverTripLog(entry: CargoDriverTripLog): void {
  try {
    const cur = loadTripLog();
    const next = [entry, ...cur.filter((t) => t.id !== entry.id)].slice(0, 30);
    localStorage.setItem(CARGO_DRIVER_TRIP_LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
