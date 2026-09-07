import type { StoreOrder, StoreOrderLineItem } from "@shared/store-order-schema";
import { normalizeStoreProductStockFields } from "@shared/store-schema";
import { appliaStorage } from "./storage-applia";

export type StoreOrderStockImpactLine = { productId: number; quantity: number };

/**
 * Agrega cantidades de producto a descontar/devolver por las líneas del pedido.
 * Promociones expanden a sus productos × cantidad de la promo.
 */
export async function buildStoreOrderStockImpact(
  storeId: number,
  items: StoreOrderLineItem[],
): Promise<StoreOrderStockImpactLine[]> {
  const qtyByProduct = new Map<number, number>();

  const add = (productId: number, quantity: number) => {
    if (!Number.isFinite(productId) || productId <= 0) return;
    const q = Math.max(0, Math.trunc(quantity));
    if (q <= 0) return;
    qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + q);
  };

  const promotions = items.some((l) => l.kind === "promotion")
    ? await appliaStorage.listStorePromotions(storeId)
    : [];

  for (const line of items) {
    const lineQty = Math.max(0, Math.trunc(Number(line.quantity) || 0));
    if (lineQty <= 0) continue;

    if (line.kind === "product") {
      if (line.productId) add(line.productId, lineQty);
      continue;
    }

    if (line.kind === "promotion" && line.promotionId) {
      const promo = promotions.find((p) => p.id === line.promotionId);
      if (!promo) continue;
      for (const item of promo.items ?? []) {
        if (item.status === "inactive") continue;
        add(item.productId, item.quantity * lineQty);
      }
    }
  }

  return [...qtyByProduct.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
}

async function applyStockImpact(
  storeId: number,
  impact: StoreOrderStockImpactLine[],
  direction: "commit" | "release",
): Promise<void> {
  const planned: Array<{ productId: number; nextStock: number }> = [];

  for (const row of impact) {
    const product = await appliaStorage.getStoreProduct(storeId, row.productId);
    if (!product) continue;
    if (product.hasStock !== true) continue;

    const current = normalizeStoreProductStockFields({
      hasStock: true,
      stock: product.stock,
    }).stock;
    const qty = Math.max(0, Math.trunc(row.quantity));
    if (qty <= 0) continue;

    if (direction === "commit") {
      if (current < qty) {
        throw new Error("STORE_PRODUCT_NO_STOCK");
      }
      planned.push({ productId: row.productId, nextStock: current - qty });
    } else {
      planned.push({ productId: row.productId, nextStock: current + qty });
    }
  }

  for (const row of planned) {
    await appliaStorage.updateStoreProduct(storeId, row.productId, {
      hasStock: true,
      stock: row.nextStock,
    });
  }
}

/**
 * Tras crear el pedido: descuenta stock y deja snapshot + stockCommitted.
 */
export async function commitStoreOrderStock(order: StoreOrder): Promise<StoreOrder> {
  if (order.stockCommitted === true) return order;
  if (order.status === "rechazado") return order;

  const impact =
    order.stockImpact && order.stockImpact.length > 0
      ? order.stockImpact
      : await buildStoreOrderStockImpact(order.storeId, order.items ?? []);

  await applyStockImpact(order.storeId, impact, "commit");

  return appliaStorage.patchStoreOrder(order.storeId, order.id, {
    stockImpact: impact,
    stockCommitted: true,
  });
}

/**
 * Ajusta inventario tras un cambio de estado ya persistido.
 * - → rechazado: devolución si estaba comprometido
 * - rechazado → confirmado (u otro no-rechazado): vuelve a descontar
 */
export async function syncStoreOrderStockAfterStatusChange(
  orderBefore: Pick<StoreOrder, "status" | "stockCommitted" | "stockImpact" | "items" | "storeId" | "id">,
  orderAfter: StoreOrder,
): Promise<StoreOrder> {
  const from = orderBefore.status;
  const to = orderAfter.status;
  if (from === to) return orderAfter;

  const impact =
    (orderAfter.stockImpact && orderAfter.stockImpact.length > 0
      ? orderAfter.stockImpact
      : orderBefore.stockImpact && orderBefore.stockImpact.length > 0
        ? orderBefore.stockImpact
        : null) ??
    (await buildStoreOrderStockImpact(orderAfter.storeId, orderAfter.items ?? []));

  if (to === "rechazado" && orderBefore.stockCommitted === true) {
    await applyStockImpact(orderAfter.storeId, impact, "release");
    return appliaStorage.patchStoreOrder(orderAfter.storeId, orderAfter.id, {
      stockImpact: impact,
      stockCommitted: false,
    });
  }

  if (from === "rechazado" && to !== "rechazado" && orderBefore.stockCommitted !== true) {
    await applyStockImpact(orderAfter.storeId, impact, "commit");
    return appliaStorage.patchStoreOrder(orderAfter.storeId, orderAfter.id, {
      stockImpact: impact,
      stockCommitted: true,
    });
  }

  return orderAfter;
}
