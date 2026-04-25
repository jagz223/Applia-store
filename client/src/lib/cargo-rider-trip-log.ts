/** Historial local del pasajero Car Go (hasta que exista API dedicada). */

export const CARGO_RIDER_TRIP_LOG_KEY = "cargo-rider-trip-log";

export type CargoRiderTripLog = {
  id: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: "genfeb" | "cash" | "bank_transfer";
  driverName: string;
};

export function loadRiderTripLog(): CargoRiderTripLog[] {
  try {
    const raw = localStorage.getItem(CARGO_RIDER_TRIP_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is CargoRiderTripLog => {
      if (!t || typeof t !== "object") return false;
      const x = t as CargoRiderTripLog;
      return (
        typeof x.id === "string" &&
        typeof x.endedAt === "string" &&
        typeof x.durationMin === "number" &&
        typeof x.amountUsd === "number" &&
        (x.payment === "genfeb" || x.payment === "cash" || x.payment === "bank_transfer") &&
        typeof x.driverName === "string"
      );
    });
  } catch {
    return [];
  }
}

export function appendRiderTripLog(entry: CargoRiderTripLog): void {
  try {
    const cur = loadRiderTripLog();
    const next = [entry, ...cur.filter((t) => t.id !== entry.id)].slice(0, 30);
    localStorage.setItem(CARGO_RIDER_TRIP_LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

