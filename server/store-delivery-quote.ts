import {
  computeStoreDeliveryFeeUsd,
  normalizeStoreDeliveryFares,
  type StoreDeliveryFares,
  type StoreLocation,
} from "@shared/store-schema";
import type { StoreOrderDeliveryLocation } from "@shared/store-order-schema";
import { computeDrivingRoute } from "./maps-route-service";

export type StoreDeliveryQuote = {
  distanceM: number;
  deliveryFee: number;
};

export async function computeStoreDeliveryQuote(
  storeLocation: StoreLocation,
  deliveryLocation: StoreOrderDeliveryLocation,
  deliveryFares?: StoreDeliveryFares | null,
): Promise<StoreDeliveryQuote> {
  const route = await computeDrivingRoute(
    { lon: storeLocation.lon, lat: storeLocation.lat },
    { lon: deliveryLocation.lon, lat: deliveryLocation.lat },
  );
  const fares = normalizeStoreDeliveryFares(deliveryFares);
  const deliveryFee = computeStoreDeliveryFeeUsd(fares, route.distanceM);
  return {
    distanceM: route.distanceM,
    deliveryFee,
  };
}
