import { z } from "zod";

export const storeFulfillmentModeSchema = z.enum(["delivery", "pickup", "in_site"]);

export type StoreFulfillmentMode = z.infer<typeof storeFulfillmentModeSchema>;

export const STORE_FULFILLMENT_MODES: StoreFulfillmentMode[] = ["delivery", "pickup", "in_site"];

export const STORE_FULFILLMENT_LABELS: Record<StoreFulfillmentMode, string> = {
  delivery: "A domicilio",
  pickup: "Recoger",
  in_site: "En el local",
};

export const STORE_FULFILLMENT_DESCRIPTIONS: Record<StoreFulfillmentMode, string> = {
  delivery:
    "Si el cliente en su carrito selecciona esta opción, nos encargaremos de agregar un delivery desde la dirección de la tienda hasta la dirección actual del cliente.",
  pickup:
    "Si el cliente decide esta opción en el carrito, significa que irá a buscar el producto en la tienda.",
  in_site:
    "Si el cliente selecciona esta opción en el carrito, el cliente consumirá o usará el producto en la tienda. Recomendado para restaurantes.",
};

export const storeFulfillmentOptionsSchema = z
  .array(storeFulfillmentModeSchema)
  .max(STORE_FULFILLMENT_MODES.length)
  .optional()
  .default([]);

export function normalizeStoreFulfillmentOptions(options: unknown): StoreFulfillmentMode[] {
  if (!Array.isArray(options)) return [];
  const enabled = new Set<StoreFulfillmentMode>();
  for (const value of options) {
    const parsed = storeFulfillmentModeSchema.safeParse(value);
    if (parsed.success) enabled.add(parsed.data);
  }
  return STORE_FULFILLMENT_MODES.filter((mode) => enabled.has(mode));
}

export function isStoreFulfillmentModeEnabled(
  storeOptions: StoreFulfillmentMode[],
  mode: StoreFulfillmentMode | null | undefined,
): boolean {
  return mode != null && storeOptions.includes(mode);
}
