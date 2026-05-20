import type { GoVehicleType } from "./mobility-fare-quote";

/** Tarifa por central: precio por km y piso mínimo (sin sumar base al aplicar el mínimo). */
export type DispatchFareTier = {
  perKmUsd: number;
  minUsd: number;
};

export type DispatchMobilityFares = {
  moto: DispatchFareTier;
  auto: DispatchFareTier & { petExtraUsd: number };
  camioneta: DispatchFareTier & { petExtraUsd: number };
  pet_car: DispatchFareTier;
};

export type DispatchPackFares = {
  moto: DispatchFareTier;
  auto: DispatchFareTier;
  camioneta: DispatchFareTier;
};

export const DEFAULT_DISPATCH_MOBILITY_FARES: DispatchMobilityFares = {
  moto: { perKmUsd: 0.5, minUsd: 2 },
  auto: { perKmUsd: 0.85, minUsd: 2.5, petExtraUsd: 1 },
  camioneta: { perKmUsd: 1.25, minUsd: 15, petExtraUsd: 2 },
  pet_car: { perKmUsd: 0.85, minUsd: 3 },
};

export const DEFAULT_DISPATCH_PACK_FARES: DispatchPackFares = {
  moto: { perKmUsd: 0.5, minUsd: 2 },
  auto: { perKmUsd: 0.85, minUsd: 2.5 },
  camioneta: { perKmUsd: 1.25, minUsd: 15 },
};

export type DispatchCompany = {
  id: string;
  name: string;
  ownerUserId: string;
  isActive: boolean;
  mobilityFares: DispatchMobilityFares;
  packFares: DispatchPackFares;
  createdAt: string;
  updatedAt: string;
};

export const DISPATCH_COMPANY_NONE = "__none__";

export function isDispatchCompanyNone(value: string | null | undefined): boolean {
  return value == null || value === "" || value === DISPATCH_COMPANY_NONE;
}

export function normalizeDispatchCompanyId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === DISPATCH_COMPANY_NONE) return null;
  return s;
}

export function vehicleTypeForDispatchMobility(vt: GoVehicleType): keyof DispatchMobilityFares {
  if (vt === "pet_car") return "pet_car";
  if (vt === "camioneta") return "camioneta";
  if (vt === "moto") return "moto";
  return "auto";
}

export function vehicleTypeForDispatchPack(
  vt: GoVehicleType,
): keyof DispatchPackFares {
  if (vt === "camioneta") return "camioneta";
  if (vt === "moto") return "moto";
  return "auto";
}
