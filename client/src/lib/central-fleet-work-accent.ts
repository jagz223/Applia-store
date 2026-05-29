import type { CentralFleetDriver } from "@/hooks/use-central";

/** Acento visual en mapa de central según modo de trabajo del conductor. */
export type FleetWorkAccent = "taxi" | "delivery" | "both" | null;

/** Etiqueta compacta cuando el conductor tiene un viaje activo (sin estados intermedios). */
export function centralDriverInServiceLabel(driver: CentralFleetDriver): string {
  if (!driver.inService) return "Buscando clientes";
  const mode = driver.activeService?.mode;
  if (mode === "taxi") return "En servicio de taxi";
  if (mode === "delivery") return "En servicio de delivery";
  return "En servicio";
}

export function centralActiveServiceModeLabel(mode: "taxi" | "delivery"): string {
  return mode === "taxi" ? "En servicio de taxi" : "En servicio de delivery";
}

/** En viaje activo no se muestran badges de «recibiendo taxi/delivery». */
export function centralDriverShowsReceivingModes(driver: CentralFleetDriver): boolean {
  if (driver.inService) return false;
  return driver.receivingTaxi || driver.receivingDelivery;
}

/** Una sola etiqueta: híbrido, taxi o delivery (nunca dos badges alternando). */
export function centralDriverReceivingModeLabel(driver: CentralFleetDriver): string | null {
  if (!centralDriverShowsReceivingModes(driver)) return null;
  if (driver.receivingTaxi && driver.receivingDelivery) return "Modo híbrido";
  if (driver.receivingTaxi) return "Recibiendo taxi";
  if (driver.receivingDelivery) return "Recibiendo delivery";
  return null;
}

export function fleetWorkAccentForDriver(driver: CentralFleetDriver): FleetWorkAccent {
  if (driver.inService) {
    if (driver.activeService?.mode === "taxi") return "taxi";
    if (driver.activeService?.mode === "delivery") return "delivery";
    return null;
  }
  if (driver.receivingTaxi && driver.receivingDelivery) return "both";
  if (driver.receivingTaxi) return "taxi";
  if (driver.receivingDelivery) return "delivery";
  return null;
}
