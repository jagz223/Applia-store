import type { CentralActiveService } from "./central-fleet";

/** Datos internos del viaje antes de exponerlos al panel central. */
export type CentralActiveServiceInternal = {
  mode: "taxi" | "delivery";
  rideId: string;
  status: "matched" | "in_progress";
  vehicleType: string;
  paymentMethod: string;
  paymentConfirmed: boolean;
  estimatedUsd: number;
  suggestedUsd: number | null;
  distanceM: number;
  durationSec: number;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string } | null;
  destinationPending?: boolean;
  routeGeometry?: unknown;
  driverSearchingClient: boolean;
  isNegotiated: boolean;
  petEnabled?: boolean;
};

/** Oculta ruta, coordenadas y datos del cliente; solo resumen A→B para la central. */
export function toCentralActiveServiceForPanel(raw: CentralActiveServiceInternal): CentralActiveService {
  return {
    mode: raw.mode,
    rideId: raw.rideId,
    status: raw.status,
    vehicleType: raw.vehicleType,
    paymentMethod: raw.paymentMethod,
    paymentConfirmed: raw.paymentConfirmed,
    estimatedUsd: raw.estimatedUsd,
    suggestedUsd: raw.suggestedUsd,
    distanceM: raw.distanceM,
    durationSec: raw.durationSec,
    start: { label: String(raw.start.label ?? "").trim() || "Punto A" },
    end: raw.destinationPending || !raw.end
      ? { label: "Sin destino" }
      : { label: String(raw.end.label ?? "").trim() || "Punto B" },
    driverSearchingClient: raw.driverSearchingClient,
    isNegotiated: raw.isNegotiated,
    ...(raw.mode === "taxi" && raw.petEnabled ? { petEnabled: true } : {}),
  };
}
