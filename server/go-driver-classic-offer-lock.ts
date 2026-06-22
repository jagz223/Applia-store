/**
 * Oferta clásica pendiente por conductor (taxi + delivery comparten un solo lock).
 * Evita dos modales clásicos a la vez en modo híbrido.
 */
export type ClassicOfferModule = "cargo" | "pack";

export type ClassicOfferPending = {
  rideId: string;
  expiresAt: number;
  module: ClassicOfferModule;
};

export type ActiveClassicOfferRow = {
  driverId: string;
  rideId: string;
  expiresAt: number;
  module: ClassicOfferModule;
};

type ActiveOfferScanner = () => ActiveClassicOfferRow[];

const pendingByDriverId = new Map<string, ClassicOfferPending>();
const activeOfferScanners: ActiveOfferScanner[] = [];

/** Registra viajes en búsqueda con oferta activa (mobility / pack). */
export function registerClassicOfferActiveScanner(scan: ActiveOfferScanner): void {
  activeOfferScanners.push(scan);
}

export function setClassicOfferPending(
  driverUserId: string,
  rideId: string,
  expiresAt: number,
  module: ClassicOfferModule,
): void {
  pendingByDriverId.set(driverUserId, { rideId, expiresAt, module });
}

export function getClassicOfferPending(driverUserId: string): ClassicOfferPending | null {
  const p = pendingByDriverId.get(driverUserId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pendingByDriverId.delete(driverUserId);
    return null;
  }
  return p;
}

export function clearClassicOfferPending(driverUserId: string): void {
  pendingByDriverId.delete(driverUserId);
}

export function clearClassicOfferPendingForRide(rideId: string): void {
  for (const [driverId, p] of pendingByDriverId.entries()) {
    if (p.rideId === rideId) pendingByDriverId.delete(driverId);
  }
}

/** True si el conductor ya tiene una oferta clásica sin resolver (cualquier módulo). */
export function driverHasActiveClassicOffer(driverUserId: string): boolean {
  if (getClassicOfferPending(driverUserId)) return true;
  const now = Date.now();
  for (const scan of activeOfferScanners) {
    for (const row of scan()) {
      if (row.driverId !== driverUserId) continue;
      if (row.expiresAt > now) return true;
    }
  }
  return false;
}

/** Solo simulación / tests locales. */
export function resetClassicOfferLockForTests(): void {
  pendingByDriverId.clear();
  activeOfferScanners.length = 0;
}
