import type { DispatchMobilityFares, DispatchPackFares } from "./dispatch-company";
import {
  vehicleTypeForDispatchMobility,
  vehicleTypeForDispatchPack,
} from "./dispatch-company";

export type MobilityFaresQuote = {
  moto: { baseUsd: number; perKmUsd: number };
  auto: { baseDayUsd: number; baseNightUsd: number; perKmUsd: number; petExtraUsd: number };
  camioneta: { baseUsd: number; perKmUsd: number; petExtraUsd: number };
};

export type PackFaresQuote = {
  moto: { baseUsd: number; perKmUsd: number };
  auto: { baseUsd: number; perKmUsd: number };
  camioneta: { baseUsd: number; perKmUsd: number };
};

export type GoVehicleType = "moto" | "auto" | "camioneta" | "pet_car";

export function roundToCents(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Tarifa de central: si el mínimo supera al total por km, se cobra solo el mínimo;
 * si el total por km es mayor, se cobra el total por distancia (sin sumar base).
 */
export function computeDistanceOrMinUsd(
  perKmUsd: number,
  minUsd: number,
  distanceM: number,
): number {
  const km = kmFromMeters(distanceM);
  const byKm = km * Number(perKmUsd);
  const min = Number(minUsd);
  if (min > byKm) return roundToCents(min);
  return roundToCents(byKm);
}

function kmFromMeters(distanceM: number): number {
  return Math.max(0, (Number(distanceM) || 0) / 1000);
}

export function isMobilityNightHour(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 19 || hour < 6;
}

/** Tarifa sugerida Car Go (taxi) según tarifas admin y distancia de ruta en metros. */
export function computeMobilitySuggestedUsd(
  fares: MobilityFaresQuote,
  vehicleType: GoVehicleType,
  distanceM: number,
  opts?: { petEnabled?: boolean; at?: Date },
): number | null {
  const km = kmFromMeters(distanceM);
  const pet = !!opts?.petEnabled;
  const night = isMobilityNightHour(opts?.at ?? new Date());

  if (vehicleType === "moto") {
    const f = fares.moto;
    return roundToCents(Math.max(0, Number(f.baseUsd) + km * Number(f.perKmUsd)));
  }
  if (vehicleType === "camioneta") {
    const f = fares.camioneta;
    const extra = pet ? Number(f.petExtraUsd) : 0;
    return roundToCents(Math.max(0, Number(f.baseUsd) + km * Number(f.perKmUsd) + extra));
  }
  if (vehicleType === "auto" || vehicleType === "pet_car") {
    const f = fares.auto;
    const base = night ? Number(f.baseNightUsd) : Number(f.baseDayUsd);
    const extra = pet || vehicleType === "pet_car" ? Number(f.petExtraUsd) : 0;
    return roundToCents(Math.max(0, base + km * Number(f.perKmUsd) + extra));
  }
  return null;
}

/** Tarifa sugerida Pack Go (delivery) según tarifas admin y distancia de ruta en metros. */
export function computePackSuggestedUsd(
  fares: PackFaresQuote,
  vehicleType: Exclude<GoVehicleType, "pet_car">,
  distanceM: number,
): number | null {
  const km = kmFromMeters(distanceM);
  const f =
    vehicleType === "camioneta" ? fares.camioneta : vehicleType === "auto" ? fares.auto : fares.moto;
  if (!f) return null;
  return roundToCents(Math.max(0, Number(f.baseUsd) + km * Number(f.perKmUsd)));
}

export function computeMobilitySuggestedByVehicle(
  fares: MobilityFaresQuote,
  distanceM: number,
  opts?: { petEnabled?: boolean; at?: Date },
): Partial<Record<GoVehicleType, number>> {
  const out: Partial<Record<GoVehicleType, number>> = {};
  for (const vt of ["moto", "auto", "pet_car", "camioneta"] as const) {
    const v = computeMobilitySuggestedUsd(fares, vt, distanceM, opts);
    if (v != null) out[vt] = v;
  }
  return out;
}

/** Tarifa taxi de una central (km o mínimo; pet extra solo si aplica precio por distancia). */
export function computeDispatchMobilityUsd(
  fares: DispatchMobilityFares,
  vehicleType: GoVehicleType,
  distanceM: number,
  opts?: { petEnabled?: boolean },
): number | null {
  const key = vehicleTypeForDispatchMobility(vehicleType);
  const tier = fares[key];
  if (!tier) return null;
  let total = computeDistanceOrMinUsd(tier.perKmUsd, tier.minUsd, distanceM);
  const km = kmFromMeters(distanceM);
  const byKm = km * Number(tier.perKmUsd);
  const min = Number(tier.minUsd);
  const usesDistance = min <= byKm;
  if (usesDistance && opts?.petEnabled) {
    const petExtra =
      key === "auto" || key === "camioneta"
        ? Number((tier as { petExtraUsd?: number }).petExtraUsd ?? 0)
        : key === "pet_car"
          ? 0
          : 0;
    if (petExtra > 0) total = roundToCents(total + petExtra);
  }
  if (vehicleType === "pet_car" && key === "pet_car") {
    return total;
  }
  return total;
}

/** Tarifa delivery de una central. */
export function computeDispatchPackUsd(
  fares: DispatchPackFares,
  vehicleType: Exclude<GoVehicleType, "pet_car">,
  distanceM: number,
): number | null {
  const key = vehicleTypeForDispatchPack(vehicleType);
  const tier = fares[key];
  if (!tier) return null;
  return computeDistanceOrMinUsd(tier.perKmUsd, tier.minUsd, distanceM);
}

export function computePackSuggestedByVehicle(
  fares: PackFaresQuote,
  distanceM: number,
): Partial<Record<"moto" | "auto" | "camioneta", number>> {
  const out: Partial<Record<"moto" | "auto" | "camioneta", number>> = {};
  for (const vt of ["moto", "auto", "camioneta"] as const) {
    const v = computePackSuggestedUsd(fares, vt, distanceM);
    if (v != null) out[vt] = v;
  }
  return out;
}
