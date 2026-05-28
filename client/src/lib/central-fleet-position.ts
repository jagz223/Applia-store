import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { CentralFleetDriver } from "@/hooks/use-central";

/** Mismo TTL que el servidor (`CENTRAL_RECEIVING_STOPPED_DISPLAY_MS`). */
export const CENTRAL_RECEIVING_STOPPED_DISPLAY_MS = 30 * 60 * 1000;

/** Texto sutil cuando perdió señal GPS pero no apagó «recibir servicios». */
export function formatCentralLastSeen(updatedAt: number | null | undefined): string | null {
  if (!updatedAt || !Number.isFinite(updatedAt)) return null;
  const rel = formatDistanceToNow(updatedAt, { locale: es, addSuffix: true });
  return `Estuvo aquí ${rel}`;
}

/** Texto al clic cuando desactivó «recibir servicios». */
export function formatCentralReceivingStopped(stoppedAt: number | null | undefined): string | null {
  if (!stoppedAt || !Number.isFinite(stoppedAt)) return null;
  const rel = formatDistanceToNow(stoppedAt, { locale: es, addSuffix: true });
  return `Apagó su servicio activo ${rel}`;
}

export function isReceivingStoppedVisibleOnMap(
  stoppedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  if (!stoppedAt || !Number.isFinite(stoppedAt)) return false;
  return now - stoppedAt <= CENTRAL_RECEIVING_STOPPED_DISPLAY_MS;
}

/** Visible en mapa de flota: recibiendo, en viaje, o acaba de apagar «recibir servicios». */
export function isCentralFleetVisibleOnMap(driver: CentralFleetDriver, now = Date.now()): boolean {
  if (driver.lat == null || driver.lon == null) return false;
  if (driver.receiving || driver.inService) return true;
  return isReceivingStoppedVisibleOnMap(driver.receivingStoppedAt, now);
}

/** Mensaje secundario para popup / panel del conductor. */
export function formatCentralFleetMapHint(driver: CentralFleetDriver): string | null {
  if (driver.receivingStoppedAt) {
    return formatCentralReceivingStopped(driver.receivingStoppedAt);
  }
  if (!driver.positionLive) {
    return formatCentralLastSeen(driver.updatedAt);
  }
  return null;
}
