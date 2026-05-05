import { FEATURE_SERVICE_PRICE_ALWAYS_ZERO } from "./feature-flags";

/** Normaliza el precio expuesto de un servicio cuando el producto es siempre gratuito vía app. */
export function applyPublicServicePrice<T extends { price?: string | number | null }>(
  service: T | undefined | null
): T | undefined | null {
  if (service == null || !FEATURE_SERVICE_PRICE_ALWAYS_ZERO) return service;
  return { ...service, price: "0.00" as T["price"] };
}

export function applyPublicServicePriceList<T extends { price?: string | number | null }>(list: T[]): T[] {
  if (!FEATURE_SERVICE_PRICE_ALWAYS_ZERO) return list;
  return list.map((s) => ({ ...s, price: "0.00" as T["price"] }));
}
