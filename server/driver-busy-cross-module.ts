/**
 * Un conductor puede tener servicio activo en taxi (mobility) o en delivery (pack).
 * Evita dependencias circulares: cada módulo registra su propio chequeo sobre su Map de viajes.
 */
type BusyCheck = (driverUserId: string) => boolean;

let mobilityCheck: BusyCheck | null = null;
let packCheck: BusyCheck | null = null;

export function registerMobilityDriverBusy(check: BusyCheck): void {
  mobilityCheck = check;
}

export function registerPackDriverBusy(check: BusyCheck): void {
  packCheck = check;
}

/** True si el conductor tiene un viaje matched/in_progress en cualquiera de los dos módulos. */
export function driverIsBusyCrossModule(driverUserId: string): boolean {
  return mobilityCheck?.(driverUserId) === true || packCheck?.(driverUserId) === true;
}
