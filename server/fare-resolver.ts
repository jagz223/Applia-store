import type { GoVehicleType } from "@shared/mobility-fare-quote";
import {
  computeDispatchMobilityUsd,
  computeDispatchPackUsd,
  computeMobilitySuggestedUsd,
  computePackSuggestedUsd,
} from "@shared/mobility-fare-quote";
import { normalizeDispatchCompanyId } from "@shared/dispatch-company";
import { getMobilityFares } from "./mobility-fares";
import { getPackFares } from "./pack-fares";
import { getDispatchCompany } from "./dispatch-companies";
import { catalogService } from "./services";
import type { GoRideModule } from "./go-ride-route-quote";

export type ResolvedFareSource = "platform" | "dispatch_company";

export async function resolveSuggestedUsdForDriver(input: {
  module: GoRideModule;
  vehicleType: GoVehicleType;
  distanceM: number;
  driverUserId: string | null | undefined;
  petEnabled?: boolean;
}): Promise<{ suggestedUsd: number; source: ResolvedFareSource; dispatchCompanyId: string | null }> {
  let dispatchCompanyId: string | null = null;
  if (input.driverUserId) {
    const provider = await catalogService.getProviderByUserId(input.driverUserId);
    dispatchCompanyId = normalizeDispatchCompanyId(
      (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
    );
  }

  if (dispatchCompanyId) {
    const company = await getDispatchCompany(dispatchCompanyId);
    if (company?.isActive) {
      if (input.module === "delivery") {
        const vt =
          input.vehicleType === "pet_car"
            ? "auto"
            : (input.vehicleType as "moto" | "auto" | "camioneta");
        const v =
          computeDispatchPackUsd(company.packFares, vt, input.distanceM) ??
          computeDispatchPackUsd(company.packFares, "auto", input.distanceM);
        if (v != null) return { suggestedUsd: v, source: "dispatch_company", dispatchCompanyId };
      } else {
        const v = computeDispatchMobilityUsd(company.mobilityFares, input.vehicleType, input.distanceM, {
          petEnabled: input.petEnabled,
        });
        if (v != null) return { suggestedUsd: v, source: "dispatch_company", dispatchCompanyId };
      }
    }
  }

  if (input.module === "delivery") {
    const vt =
      input.vehicleType === "pet_car"
        ? "auto"
        : (input.vehicleType as "moto" | "auto" | "camioneta");
    const fares = await getPackFares();
    const suggestedUsd =
      computePackSuggestedUsd(fares, vt, input.distanceM) ??
      computePackSuggestedUsd(fares, "auto", input.distanceM) ??
      0;
    return { suggestedUsd, source: "platform", dispatchCompanyId: null };
  }

  const fares = await getMobilityFares();
  const suggestedUsd =
    computeMobilitySuggestedUsd(fares, input.vehicleType, input.distanceM, {
      petEnabled: input.petEnabled,
    }) ?? 0;
  return { suggestedUsd, source: "platform", dispatchCompanyId: null };
}
