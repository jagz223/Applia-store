import { roundToCents } from "@shared/mobility-fare-quote";
import { resolveSuggestedUsdForDriver } from "./fare-resolver";
import type { GoRideModule } from "./go-ride-route-quote";
import type { GoVehicleType } from "@shared/mobility-fare-quote";

type RideFareFields = {
  distanceM: number;
  vehicleType: GoVehicleType;
  petEnabled?: boolean;
  isNegotiated?: boolean;
  estimatedUsd: number;
  suggestedUsd?: number;
};

/** Recalcula precio estándar al asignar conductor (tarifa de su central si aplica). */
export async function applyDriverFareToRide(
  ride: RideFareFields,
  driverUserId: string,
  module: GoRideModule,
): Promise<void> {
  if (ride.isNegotiated) return;
  const { suggestedUsd } = await resolveSuggestedUsdForDriver({
    module,
    vehicleType: ride.vehicleType,
    distanceM: ride.distanceM,
    driverUserId,
    petEnabled: ride.petEnabled,
  });
  const usd = roundToCents(suggestedUsd);
  ride.suggestedUsd = usd;
  ride.estimatedUsd = usd;
}
