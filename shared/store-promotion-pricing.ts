export type StorePromotionProductLine = {
  id: number;
  price: number;
  quantity: number;
};

export function computeStorePromotionLineTotal(price: number, quantity: number): number {
  return roundStoreMoney((Number(price) || 0) * (Number(quantity) || 0));
}

export function computeStorePromotionItemsSubtotal(
  products: readonly StorePromotionProductLine[],
): number {
  return roundStoreMoney(
    products.reduce(
      (sum, p) => sum + computeStorePromotionLineTotal(p.price, p.quantity),
      0,
    ),
  );
}

export function computeStorePromotionSavings(itemsSubtotal: number, promotionPrice: number): number {
  const diff = itemsSubtotal - promotionPrice;
  return diff > 0 ? roundStoreMoney(diff) : 0;
}

export function roundStoreMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatStoreMoney(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}
