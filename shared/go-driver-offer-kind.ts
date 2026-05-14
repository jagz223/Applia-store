import type { VehicleType } from "@shared/vehicle-schema";

/** Valores del select «Tipo de oferta (subcategoría)» en Become Pro / Become Driver. */
export type GoDriverOfferKindSlug = "moto" | "carro" | "camion";

export const GO_DRIVER_OFFER_KIND_LABELS: Record<GoDriverOfferKindSlug, string> = {
  moto: "Moto",
  carro: "Carro",
  /** Camión pesado no se usa en el formulario; este valor corresponde a camioneta (pickup). */
  camion: "Camioneta",
};

export function vehicleTypeToGoOfferKind(vehicleType: string | undefined | null): GoDriverOfferKindSlug {
  const s = String(vehicleType ?? "").trim().toLowerCase();
  if (s === "motorcycle") return "moto";
  if (s === "pickup_truck" || s === "truck") return "camion";
  return "carro";
}

/** moto → motorcycle; carro → car; camioneta → pickup_truck (sin camión pesado). */
export function goOfferKindToVehicleType(kind: GoDriverOfferKindSlug): VehicleType {
  if (kind === "moto") return "motorcycle";
  if (kind === "camion") return "pickup_truck";
  return "car";
}
