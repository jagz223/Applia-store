import type { CentralFleetPresencePayload } from "./central-fleet-notify";

/** Tiempo que permanece en mapa tras apagar «recibir servicios» (última posición + mensaje al clic). */
export const CENTRAL_RECEIVING_STOPPED_DISPLAY_MS = 30 * 60 * 1000;

export type ReceivingStoppedRecord = {
  userId: string;
  stoppedAt: number;
  lat: number;
  lon: number;
  vehicleType: string;
  isPetFriendly: boolean;
  dispatchCompanyId: string | null;
};

const stoppedByUser = new Map<string, ReceivingStoppedRecord>();

export function recordReceivingStopped(pres: CentralFleetPresencePayload): void {
  const lat = Number(pres.lat);
  const lon = Number(pres.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  stoppedByUser.set(pres.userId, {
    userId: pres.userId,
    stoppedAt: Date.now(),
    lat,
    lon,
    vehicleType: pres.vehicleType,
    isPetFriendly: pres.isPetFriendly,
    dispatchCompanyId: pres.dispatchCompanyId,
  });
}

export function clearReceivingStopped(userId: string): void {
  stoppedByUser.delete(userId);
}

export function getReceivingStopped(userId: string): ReceivingStoppedRecord | null {
  const row = stoppedByUser.get(userId);
  if (!row) return null;
  if (Date.now() - row.stoppedAt > CENTRAL_RECEIVING_STOPPED_DISPLAY_MS) {
    stoppedByUser.delete(userId);
    return null;
  }
  return row;
}

export function isReceivingStoppedVisible(userId: string): boolean {
  return getReceivingStopped(userId) != null;
}
