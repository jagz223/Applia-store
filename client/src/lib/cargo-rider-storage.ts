/** Viaje Car Go del pasajero (p. ej. matched) para reanudar al reabrir la app. */

export const CARGO_RIDER_ACTIVE_RIDE_KEY = "cargo-rider-active-ride-id";

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
