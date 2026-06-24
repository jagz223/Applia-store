/** Motivos de cancelación Go (taxi + delivery) con feedback obligatorio. */

export type GoCancellationModule = "cargo" | "pack";
export type GoCancellationParty = "rider" | "driver";
export type GoDriverCancelPhase = "en_route" | "at_pickup";

export type GoCancellationReasonOption = {
  code: string;
  labelRiderCargo: string;
  labelRiderPack: string;
};

export const GO_RIDER_CANCELLATION_REASONS: GoCancellationReasonOption[] = [
  { code: "no_longer_needed", labelRiderCargo: "Ya no necesito el servicio", labelRiderPack: "Ya no necesito el envío" },
  {
    code: "driver_slow",
    labelRiderCargo: "El conductor tarda mucho en llegar",
    labelRiderPack: "El repartidor tarda mucho en llegar",
  },
  {
    code: "requested_by_mistake",
    labelRiderCargo: "Solicité el servicio por error",
    labelRiderPack: "Solicité el envío por error",
  },
  { code: "fare_too_high", labelRiderCargo: "Tarifa muy alta", labelRiderPack: "Tarifa muy alta" },
  {
    code: "driver_asked_cancel",
    labelRiderCargo: "El conductor me pidió cancelar",
    labelRiderPack: "El repartidor me pidió cancelar",
  },
  { code: "other", labelRiderCargo: "Otro", labelRiderPack: "Otro" },
];

export const GO_DRIVER_CANCEL_EN_ROUTE_REASONS: GoCancellationReasonOption[] = [
  { code: "vehicle_issue", labelRiderCargo: "Tengo un inconveniente con mi vehículo", labelRiderPack: "Tengo un inconveniente con mi vehículo" },
  { code: "client_asked_cancel", labelRiderCargo: "El cliente me pidió cancelar", labelRiderPack: "El cliente me pidió cancelar" },
  { code: "traffic_blocked", labelRiderCargo: "Tráfico pesado / Ruta obstruida", labelRiderPack: "Tráfico pesado / Ruta obstruida" },
  { code: "personal_emergency", labelRiderCargo: "Emergencia personal", labelRiderPack: "Emergencia personal" },
  { code: "other", labelRiderCargo: "Otro", labelRiderPack: "Otro" },
];

export const GO_DRIVER_CANCEL_AT_PICKUP_REASONS: GoCancellationReasonOption[] = [
  { code: "client_no_show", labelRiderCargo: "El cliente no se presentó", labelRiderPack: "El cliente no se presentó" },
  { code: "client_asked_cancel", labelRiderCargo: "El cliente me pidió cancelar", labelRiderPack: "El cliente me pidió cancelar" },
  { code: "cannot_contact_client", labelRiderCargo: "No puedo contactar al cliente", labelRiderPack: "No puedo contactar al cliente" },
  {
    code: "excess_passengers_luggage",
    labelRiderCargo: "Exceso de pasajeros / Equipaje",
    labelRiderPack: "Exceso de carga / paquete",
  },
  { code: "unsafe_area", labelRiderCargo: "Zona insegura o inaccesible", labelRiderPack: "Zona insegura o inaccesible" },
  { code: "other", labelRiderCargo: "Otro", labelRiderPack: "Otro" },
];

export function goCancellationReasonLabel(
  option: GoCancellationReasonOption,
  module: GoCancellationModule,
): string {
  return module === "pack" ? option.labelRiderPack : option.labelRiderCargo;
}

export function listGoCancellationReasons(input: {
  party: GoCancellationParty;
  module: GoCancellationModule;
  driverPhase?: GoDriverCancelPhase | null;
}): Array<{ code: string; label: string }> {
  let options: GoCancellationReasonOption[];
  if (input.party === "rider") {
    options = GO_RIDER_CANCELLATION_REASONS;
  } else if (input.driverPhase === "at_pickup") {
    options = GO_DRIVER_CANCEL_AT_PICKUP_REASONS;
  } else {
    options = GO_DRIVER_CANCEL_EN_ROUTE_REASONS;
  }
  return options.map((o) => ({
    code: o.code,
    label: goCancellationReasonLabel(o, input.module),
  }));
}

export function resolveGoCancellationReasonLabel(input: {
  party: GoCancellationParty;
  module: GoCancellationModule;
  driverPhase?: GoDriverCancelPhase | null;
  reasonCode: string;
}): string | null {
  const row = listGoCancellationReasons(input).find((r) => r.code === input.reasonCode);
  return row?.label ?? null;
}

/** Cancelación con motivo solo cuando ya hubo match o el viaje está en curso. */
export function goCancellationFeedbackRequired(rideStatus: string): boolean {
  return rideStatus === "matched" || rideStatus === "in_progress";
}

export type GoCancellationFeedbackRecord = {
  id: string;
  rideId: string;
  module: GoCancellationModule;
  cancelledBy: GoCancellationParty;
  cancellerUserId: string;
  cancellerName: string;
  otherPartyUserId: string | null;
  otherPartyName: string | null;
  rideStatusAtCancel: string;
  driverPhase: GoDriverCancelPhase | null;
  reasonCode: string;
  reasonLabel: string;
  explanation: string;
  cancellerRatingAtCancel: number;
  cancellerRatingCountAtCancel: number;
  adminReviewStatus: "pending" | "no_penalty" | "penalty_applied";
  penaltyAmount: number | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  createdAt: string;
};
