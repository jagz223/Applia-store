import type { CentralFleetPresencePayload } from "./central-fleet-notify";

/** Cuánto tiempo mostrar en mapa la última posición tras perder señal en vivo. */
export const CENTRAL_LAST_KNOWN_DISPLAY_MS = 4 * 60 * 60 * 1000;

const lastKnownByUser = new Map<string, CentralFleetPresencePayload>();

export function recordCentralFleetLastKnown(pres: CentralFleetPresencePayload): void {
  const lat = Number(pres.lat);
  const lon = Number(pres.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  if (Math.abs(lat) <= 1e-4 && Math.abs(lon) <= 1e-4) return;
  lastKnownByUser.set(pres.userId, { ...pres, lat, lon });
}

export function getCentralFleetLastKnown(userId: string): CentralFleetPresencePayload | null {
  const row = lastKnownByUser.get(userId);
  if (!row) return null;
  if (Date.now() - row.updatedAt > CENTRAL_LAST_KNOWN_DISPLAY_MS) return null;
  return row;
}
