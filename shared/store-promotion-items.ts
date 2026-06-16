import { z } from "zod";

export const storePromotionItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Mínimo 1 unidad").max(9999),
});

export type StorePromotionItem = z.infer<typeof storePromotionItemSchema>;

export function normalizeStorePromotionItems(
  items: readonly StorePromotionItem[],
): StorePromotionItem[] {
  const merged = new Map<number, number>();
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Math.trunc(Number(item.quantity));
    if (!Number.isFinite(productId) || productId <= 0) continue;
    if (!Number.isFinite(quantity) || quantity < 1) continue;
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  return Array.from(merged.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

/** Compatibilidad con promociones guardadas solo con `productIds`. */
export function storePromotionItemsFromLegacy(
  items: unknown,
  productIds: unknown,
): StorePromotionItem[] {
  if (Array.isArray(items) && items.length > 0) {
    const parsed: StorePromotionItem[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const productId = Number((raw as { productId?: unknown }).productId);
      const quantity = Number((raw as { quantity?: unknown }).quantity ?? 1);
      if (!Number.isFinite(productId) || productId <= 0) continue;
      parsed.push({
        productId,
        quantity: Number.isFinite(quantity) && quantity >= 1 ? Math.trunc(quantity) : 1,
      });
    }
    return normalizeStorePromotionItems(parsed);
  }
  if (Array.isArray(productIds)) {
    return normalizeStorePromotionItems(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((productId) => ({ productId, quantity: 1 })),
    );
  }
  return [];
}

export function storePromotionProductIds(items: readonly StorePromotionItem[]): number[] {
  return items.map((item) => item.productId);
}

export function storePromotionTotalQuantity(items: readonly StorePromotionItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
