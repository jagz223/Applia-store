/**
 * Tablero de regateo por “vista” de tipo de servicio (UI taxi / delivery).
 * El conductor solo ve pestañas compatibles con su vehículo registrado.
 */

/** Mapa segmento UI taxi → tipo vehículo proveedor (mismo criterio que el servidor Car Go). */
export const NEGOTIATION_MATCH_MAP_CARGO: Record<string, string> = {
  moto: "motorcycle",
  auto: "car",
  pet_car: "car",
  camioneta: "pickup_truck",
};

/** Mapa segmento UI delivery → tipo vehículo proveedor (Pack Go). */
export const NEGOTIATION_MATCH_MAP_PACK: Record<string, string> = {
  moto: "motorcycle",
  auto: "car",
  camioneta: "pickup_truck",
};

export const NEGOTIATION_CARGO_SEGMENT_IDS = Object.keys(NEGOTIATION_MATCH_MAP_CARGO);
export const NEGOTIATION_PACK_SEGMENT_IDS = Object.keys(NEGOTIATION_MATCH_MAP_PACK);

const CARGO_LABEL = {
  moto: "Moto",
  auto: "Carro",
  pet_car: "Pet friendly",
  camioneta: "Camioneta",
} as const;

const PACK_LABEL = {
  moto: "Moto",
  auto: "Carro",
  camioneta: "Camioneta",
} as const;

export type NegotiationBoardTab = { id: string; label: string };

/**
 * Pestañas de regateo que el conductor puede abrir según `vehicle_type` del proveedor.
 * - Carro: ve “Carro” y, si el vehículo admite mascotas, también “Pet friendly”.
 * - Camioneta/camión: una pestaña “Camioneta”.
 */
export function negotiationBoardTabsForProviderVehicle(
  providerVehicleType: string | undefined,
  isPetFriendly: boolean
): NegotiationBoardTab[] {
  const vt = String(providerVehicleType ?? "").trim();
  if (vt === "motorcycle") {
    return [{ id: "moto", label: CARGO_LABEL.moto }];
  }
  if (vt === "car") {
    const tabs: NegotiationBoardTab[] = [{ id: "auto", label: CARGO_LABEL.auto }];
    if (isPetFriendly) tabs.push({ id: "pet_car", label: CARGO_LABEL.pet_car });
    return tabs;
  }
  if (vt === "pickup_truck" || vt === "truck") {
    return [{ id: "camioneta", label: CARGO_LABEL.camioneta }];
  }
  return [];
}

export function negotiationSegmentLabel(segmentId: string, module: "cargo" | "pack"): string {
  if (module === "cargo") {
    return (CARGO_LABEL as Record<string, string>)[segmentId] ?? segmentId;
  }
  return (PACK_LABEL as Record<string, string>)[segmentId] ?? segmentId;
}
