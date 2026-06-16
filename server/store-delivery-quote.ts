import { computeLowestPackSuggestedUsd } from "@shared/mobility-fare-quote";
import type { StoreLocation } from "@shared/store-schema";
import type { StoreOrderDeliveryLocation } from "@shared/store-order-schema";
import { computeDrivingRoute } from "./maps-route-service";
import { getPackFares } from "./pack-fares";

export type StoreDeliveryQuote = {
  distanceM: number;
  deliveryFee: number;
};

export async function computeStoreDeliveryQuote(
  storeLocation: StoreLocation,
  deliveryLocation: StoreOrderDeliveryLocation,
): Promise<StoreDeliveryQuote> {
  const route = await computeDrivingRoute(
    { lon: storeLocation.lon, lat: storeLocation.lat },
    { lon: deliveryLocation.lon, lat: deliveryLocation.lat },
  );
  const fares = await getPackFares();
  const deliveryFee = computeLowestPackSuggestedUsd(fares, route.distanceM);
  return {
    distanceM: route.distanceM,
    deliveryFee,
  };
}
