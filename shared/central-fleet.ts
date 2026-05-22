/** Punto de recogida o destino visible para la central (sin coordenadas ni ruta). */
export type CentralActiveServicePoint = {
  label: string;
};

/** Viaje en curso o asignado que ve la central al seleccionar un conductor (sin datos del cliente ni ruta). */
export type CentralActiveService = {
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
  start: CentralActiveServicePoint;
  end: CentralActiveServicePoint;
  driverSearchingClient: boolean;
  isNegotiated: boolean;
  /** Solo taxi (movilidad). */
  petEnabled?: boolean;
};
