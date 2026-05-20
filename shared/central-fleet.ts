/** Cliente / pasajero asociado a un servicio activo (panel central). */
export type CentralActiveServiceRider = {
  name: string;
  lastName: string;
  phone: string | null;
  profileImageUrl: string | null;
  rating: number;
  ratingCount: number;
  completedTrips: number;
  email: string;
};

/** Viaje en curso o asignado que ve la central al seleccionar un conductor. */
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
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  /** GeoJSON (p. ej. LineString) o null si solo hay tramo recto A→B. */
  routeGeometry: unknown;
  driverSearchingClient: boolean;
  isNegotiated: boolean;
  /** Solo taxi (movilidad). */
  petEnabled?: boolean;
  rider: CentralActiveServiceRider;
};
