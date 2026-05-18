import type { GeoJsonObject } from "geojson";
import {
  computeMobilitySuggestedUsd,
  computePackSuggestedUsd,
  type GoVehicleType,
} from "@shared/mobility-fare-quote";
import { getMobilityFares } from "./mobility-fares";
import { getPackFares } from "./pack-fares";
import { computeDrivingRoute } from "./maps-route-service";

export type GoRideModule = "taxi" | "delivery";

export type ResolvedGoRideRouteQuote = {
  distanceM: number;
  durationSec: number;
  geometry: GeoJsonObject | null;
  suggestedUsd: number;
  routeSource: "geoapify" | "fallback";
};

export async function resolveGoRideRouteQuote(input: {
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  vehicleType: GoVehicleType;
  module: GoRideModule;
  petEnabled?: boolean;
}): Promise<ResolvedGoRideRouteQuote> {
  const route = await computeDrivingRoute(
    { lon: input.start.lon, lat: input.start.lat },
    { lon: input.end.lon, lat: input.end.lat },
  );

  let suggestedUsd = 0;
  if (input.module === "delivery") {
    const vt =
      input.vehicleType === "pet_car"
        ? "auto"
        : (input.vehicleType as "moto" | "auto" | "camioneta");
    const fares = await getPackFares();
    suggestedUsd =
      computePackSuggestedUsd(fares, vt, route.distanceM) ??
      computePackSuggestedUsd(fares, "auto", route.distanceM) ??
      0;
  } else {
    const fares = await getMobilityFares();
    suggestedUsd =
      computeMobilitySuggestedUsd(fares, input.vehicleType, route.distanceM, {
        petEnabled: input.petEnabled,
      }) ?? 0;
  }

  return {
    distanceM: route.distanceM,
    durationSec: route.durationSec,
    geometry: (route.geometry as GeoJsonObject) ?? null,
    suggestedUsd,
    routeSource: route.source,
  };
}
