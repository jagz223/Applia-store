import type { CentralFleetDriver } from "@/hooks/use-central";

/** Acento visual en mapa de central según modo de trabajo del conductor. */
export type FleetWorkAccent = "taxi" | "delivery" | "both" | null;

export function fleetWorkAccentForDriver(driver: CentralFleetDriver): FleetWorkAccent {
  if (driver.receivingTaxi && driver.receivingDelivery) return "both";
  if (driver.receivingTaxi) return "taxi";
  if (driver.receivingDelivery) return "delivery";
  if (driver.inService && driver.activeService?.mode === "taxi") return "taxi";
  if (driver.inService && driver.activeService?.mode === "delivery") return "delivery";
  return null;
}
