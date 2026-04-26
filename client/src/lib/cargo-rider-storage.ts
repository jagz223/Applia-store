/** Viaje Car Go del pasajero (p. ej. matched) para reanudar al reabrir la app. */

export const CARGO_RIDER_ACTIVE_RIDE_KEY = "cargo-rider-active-ride-id";
export const PACK_RIDER_ACTIVE_RIDE_KEY = "pack-rider-active-ride-id";

export function loadRiderActiveRideId(): string | null {
  try {
    const v = localStorage.getItem(CARGO_RIDER_ACTIVE_RIDE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveRiderActiveRideId(rideId: string): void {
  try {
    localStorage.setItem(CARGO_RIDER_ACTIVE_RIDE_KEY, rideId);
  } catch {
    /* ignore */
  }
}

export function clearRiderActiveRideId(): void {
  try {
    localStorage.removeItem(CARGO_RIDER_ACTIVE_RIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadGoRiderActiveRideId(goSlug: "cargo" | "pack"): string | null {
  try {
    const key = goSlug === "pack" ? PACK_RIDER_ACTIVE_RIDE_KEY : CARGO_RIDER_ACTIVE_RIDE_KEY;
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveGoRiderActiveRideId(goSlug: "cargo" | "pack", rideId: string): void {
  try {
    const key = goSlug === "pack" ? PACK_RIDER_ACTIVE_RIDE_KEY : CARGO_RIDER_ACTIVE_RIDE_KEY;
    localStorage.setItem(key, rideId);
  } catch {
    /* ignore */
  }
}

export function clearGoRiderActiveRideId(goSlug: "cargo" | "pack"): void {
  try {
    const key = goSlug === "pack" ? PACK_RIDER_ACTIVE_RIDE_KEY : CARGO_RIDER_ACTIVE_RIDE_KEY;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
