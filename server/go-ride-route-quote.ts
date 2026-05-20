import type { GeoJsonObject } from "geojson";
import type { GoVehicleType } from "@shared/mobility-fare-quote";
import { computeDrivingRoute } from "./maps-route-service";
import { resolveSuggestedUsdForDriver } from "./fare-resolver";

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
  /** Si se indica, aplica tarifas de la central del conductor; si no, tarifas globales. */
  driverUserId?: string | null;
}): Promise<ResolvedGoRideRouteQuote> {
  const route = await computeDrivingRoute(
    { lon: input.start.lon, lat: input.start.lat },
    { lon: input.end.lon, lat: input.end.lat },
  );

  const { suggestedUsd } = await resolveSuggestedUsdForDriver({
    module: input.module,
    vehicleType: input.vehicleType,
    distanceM: route.distanceM,
    driverUserId: input.driverUserId ?? null,
    petEnabled: input.petEnabled,
  });

  return {
    distanceM: route.distanceM,
    durationSec: route.durationSec,
    geometry: (route.geometry as GeoJsonObject) ?? null,
    suggestedUsd,
    routeSource: route.source,
  };
}
