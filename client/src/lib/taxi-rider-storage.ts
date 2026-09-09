/** Viaje Transporte del pasajero (p. ej. matched) para reanudar al reabrir la app. */

export const TAXI_RIDER_ACTIVE_RIDE_KEY = "taxi-rider-active-ride-id";
export const PACK_RIDER_ACTIVE_RIDE_KEY = "pack-rider-active-ride-id";

export function loadRiderActiveRideId(): string | null {
  try {
    const v = localStorage.getItem(TAXI_RIDER_ACTIVE_RIDE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveRiderActiveRideId(rideId: string): void {
  try {
    localStorage.setItem(TAXI_RIDER_ACTIVE_RIDE_KEY, rideId);
  } catch {
    /* ignore */
  }
}

export function clearRiderActiveRideId(): void {
  try {
    localStorage.removeItem(TAXI_RIDER_ACTIVE_RIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadGoRiderActiveRideId(goSlug: "taxi" | "pack"): string | null {
  try {
    const key = goSlug === "pack" ? PACK_RIDER_ACTIVE_RIDE_KEY : TAXI_RIDER_ACTIVE_RIDE_KEY;
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveGoRiderActiveRideId(goSlug: "taxi" | "pack", rideId: string): void {
  try {
    const key = goSlug === "pack" ? PACK_RIDER_ACTIVE_RIDE_KEY : TAXI_RIDER_ACTIVE_RIDE_KEY;
    localStorage.setItem(key, rideId);
  } catch {
    /* ignore */
  }
}

export function clearGoRiderActiveRideId(goSlug: "taxi" | "pack"): void {
  try {
    const key = goSlug === "pack" ? PACK_RIDER_ACTIVE_RIDE_KEY : TAXI_RIDER_ACTIVE_RIDE_KEY;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
