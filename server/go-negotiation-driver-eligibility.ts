import { catalogService } from "./services";
import { appliaStorage } from "./storage-applia";
import { NEGOTIATION_MATCH_MAP_CARGO, NEGOTIATION_MATCH_MAP_PACK } from "@shared/go-negotiation-board-segments";

export type NegotiationVehicleMatchOptions = {
  petRideKind?: string;
  /**
   * Si es true (defecto), el proveedor debe estar verificado.
   * El tablero de solo lectura usa `requireVerified: false`; enviar oferta comprueba verificación aparte en la ruta HTTP.
   */
  requireVerified?: boolean;
};

export type DriverPrimaryVehicleSnapshot = {
  vehicle_type: string;
  is_pet_friendly?: boolean;
};

/** Tipos de vehículo registrado equivalentes para un mismo servicio en UI (p. ej. camión ligero). */
const EQUIVALENT_PROVIDER_TYPES: Record<string, readonly string[]> = {
  pickup_truck: ["pickup_truck", "truck"],
};

function allowedProviderVehicleTypes(
  rideVehicleKind: string,
  kindToProviderVehicle: Record<string, string>
): readonly string[] | null {
  const base = kindToProviderVehicle[rideVehicleKind];
  if (!base) return null;
  return EQUIVALENT_PROVIDER_TYPES[base] ?? [base];
}

/**
 * Vehículo del conductor: primero por proveedor, si no hay fila de proveedor por userId en `vehicles`
 * (misma fuente que el mapa conductor).
 */
export async function resolveDriverPrimaryVehicleForNegotiation(
  driverUserId: string
): Promise<DriverPrimaryVehicleSnapshot | null> {
  const provider = await catalogService.getProviderByUserId(driverUserId);
  if (provider) {
    const v = await appliaStorage.getPrimaryVehicleByProviderId((provider as { id: number }).id);
    if (v) return { vehicle_type: v.vehicle_type, is_pet_friendly: v.is_pet_friendly };
  }
  const byUser = await appliaStorage.getPrimaryVehicleByUserId(driverUserId);
  if (byUser) return { vehicle_type: byUser.vehicle_type, is_pet_friendly: byUser.is_pet_friendly };
  return null;
}

/**
 * Comprueba si el conductor (vehículo primario) puede ver u ofertar en un ride cuyo tipo UI es `rideVehicleKind`.
 */
export async function driverPrimaryVehicleMatchesRideKind(
  driverUserId: string,
  rideVehicleKind: string,
  kindToProviderVehicle: Record<string, string>,
  options?: NegotiationVehicleMatchOptions
): Promise<boolean> {
  const requireVerified = options?.requireVerified !== false;

  const provider = await catalogService.getProviderByUserId(driverUserId);
  if (requireVerified) {
    if (!provider || (provider as { isVerified?: boolean }).isVerified !== true) return false;
  }

  const vehicle = await resolveDriverPrimaryVehicleForNegotiation(driverUserId);
  if (!vehicle) return false;

  const allowed = allowedProviderVehicleTypes(rideVehicleKind, kindToProviderVehicle);
  if (!allowed || allowed.length === 0) return false;

  const vt = String(vehicle.vehicle_type ?? "").trim();
  if (!allowed.includes(vt)) return false;

  const petKind = options?.petRideKind ?? "pet_car";
  if (rideVehicleKind === petKind && !vehicle.is_pet_friendly) return false;

  return true;
}

/** Valida que el conductor pueda consultar el tablero filtrado por `vehicleSegment` (vista moto, carro, etc.). */
export async function driverCanAccessNegotiationBoardSegment(
  driverUserId: string,
  segment: string,
  module: "cargo" | "pack"
): Promise<boolean> {
  const table = module === "cargo" ? NEGOTIATION_MATCH_MAP_CARGO : NEGOTIATION_MATCH_MAP_PACK;
  if (!Object.prototype.hasOwnProperty.call(table, segment)) return false;
  return driverPrimaryVehicleMatchesRideKind(driverUserId, segment, table, {
    petRideKind: "pet_car",
    requireVerified: false,
  });
}
