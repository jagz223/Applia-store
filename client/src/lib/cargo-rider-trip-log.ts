/**
 * Historial local del pasajero (quien solicita taxi/delivery).
 * Va por cuenta (`user.id`), separado del historial del conductor (`cargo-driver-trip-log`).
 */

export const CARGO_RIDER_TRIP_LOG_KEY = "cargo-rider-trip-log";

export type CargoRiderTripLog = {
  id: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: "applia" | "cash" | "bank_transfer";
  driverName: string;
  /** Módulo: taxi (`cargo`) o delivery (`pack`). */
  goSlug?: "cargo" | "pack";
  /** Desde historial del servidor (completado, cancelado, expirado). */
  outcome?: "completed" | "cancelled" | "expired";
  statusLabel?: string;
};

function normalizeAccountId(accountId: string | null | undefined): string | null {
  if (typeof accountId !== "string") return null;
  const t = accountId.trim();
  return t.length > 0 ? t : null;
}

/** Clave en localStorage: una lista por usuario (o invitado). */
export function riderTripLogStorageKey(accountId: string | null | undefined): string {
  const id = normalizeAccountId(accountId);
  return id ? `${CARGO_RIDER_TRIP_LOG_KEY}:user:${id}` : `${CARGO_RIDER_TRIP_LOG_KEY}:guest`;
}

function parseRiderTripLogRaw(raw: string | null): CargoRiderTripLog[] {
  if (!raw) return [];
  try {
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
        (x.payment === "applia" || x.payment === "cash" || x.payment === "bank_transfer") &&
        typeof x.driverName === "string" &&
        (x.goSlug === undefined || x.goSlug === "cargo" || x.goSlug === "pack")
      );
    });
  } catch {
    return [];
  }
}

export function loadRiderTripLog(accountId?: string | null): CargoRiderTripLog[] {
  try {
    const key = riderTripLogStorageKey(accountId ?? null);
    let rows = parseRiderTripLogRaw(localStorage.getItem(key));
    // Importante: si hay `accountId` autenticado, NO migramos el legacy global para evitar mezclar
    // historiales entre cuentas en un mismo dispositivo.
    if (rows.length === 0 && normalizeAccountId(accountId ?? null) == null) {
      const legacy = parseRiderTripLogRaw(localStorage.getItem(CARGO_RIDER_TRIP_LOG_KEY));
      if (legacy.length > 0) {
        try {
          localStorage.setItem(key, JSON.stringify(legacy));
          localStorage.removeItem(CARGO_RIDER_TRIP_LOG_KEY);
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

export function appendRiderTripLog(entry: CargoRiderTripLog, accountId?: string | null): void {
  try {
    const key = riderTripLogStorageKey(accountId ?? null);
    const cur = parseRiderTripLogRaw(localStorage.getItem(key));
    const next = [entry, ...cur.filter((t) => t.id !== entry.id)].slice(0, 30);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
