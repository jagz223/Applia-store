import type {
  AddStoreCartItem,
  RemoveStoreCartItem,
  StoreCart,
  StoreCartItem,
  UpdateStoreCartItem,
} from "@shared/store-cart-schema";
import type { StoreProduct, StorePromotion } from "@shared/store-schema";
import { genFebStorage } from "./storage-genfeb";

export type EnrichedStoreCartLine = {
  kind: "product" | "promotion";
  productId?: number;
  promotionId?: number;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
};

export type EnrichedStoreCart = {
  storeId: number;
  items: EnrichedStoreCartLine[];
  subtotal: number;
  itemCount: number;
  expiresAt: string | null;
};

export function addBodyToCartItem(body: AddStoreCartItem): StoreCartItem {
  if (body.kind === "product") {
    return {
      kind: "product",
      productId: body.productId!,
      quantity: body.quantity ?? 1,
    };
  }
  return {
    kind: "promotion",
    promotionId: body.promotionId!,
    quantity: Math.min(body.quantity ?? 1, 99),
  };
}

function cartLineKey(item: StoreCartItem): string {
  return item.kind === "product" ? `p:${item.productId}` : `m:${item.promotionId}`;
}

export function mergeAddCartItem(items: StoreCartItem[], incoming: StoreCartItem): StoreCartItem[] {
  const key = cartLineKey(incoming);
  const idx = items.findIndex((i) => cartLineKey(i) === key);
  if (idx === -1) return [...items, incoming];
  const current = items[idx];
  const maxQty = incoming.kind === "promotion" ? 99 : 9999;
  const nextQty = Math.min(maxQty, current.quantity + incoming.quantity);
  return items.map((item, i) => (i === idx ? { ...item, quantity: nextQty } : item));
}

export function setCartItemQuantity(items: StoreCartItem[], patch: UpdateStoreCartItem): StoreCartItem[] {
  const incoming =
    patch.kind === "product"
      ? ({ kind: "product" as const, productId: patch.productId!, quantity: patch.quantity })
      : ({ kind: "promotion" as const, promotionId: patch.promotionId!, quantity: patch.quantity });
  const key = cartLineKey(incoming);
  if (patch.quantity <= 0) {
    return items.filter((i) => cartLineKey(i) !== key);
  }
  const maxQty = patch.kind === "promotion" ? 99 : 9999;
  const quantity = Math.min(maxQty, patch.quantity);
  const idx = items.findIndex((i) => cartLineKey(i) === key);
  if (idx === -1) return [...items, { ...incoming, quantity }];
  return items.map((item, i) => (i === idx ? { ...item, quantity } : item));
}

export function removeCartItem(items: StoreCartItem[], patch: RemoveStoreCartItem): StoreCartItem[] {
  const key =
    patch.kind === "product" ? `p:${patch.productId}` : `m:${patch.promotionId}`;
  return items.filter((i) => cartLineKey(i) !== key);
}

async function isValidCartItem(
  storeId: number,
  item: StoreCartItem,
  products: StoreProduct[],
  promotions: StorePromotion[],
): Promise<boolean> {
  if (item.kind === "product") {
    const product = products.find((p) => p.id === item.productId && p.storeId === storeId);
    return Boolean(product && product.showOnShowcase !== false);
  }
  const promotion = promotions.find((p) => p.id === item.promotionId && p.storeId === storeId);
  return Boolean(
    promotion &&
      promotion.status === "active" &&
      promotion.items.some((line) => line.status === "active"),
  );
}

export async function enrichStoreCart(cart: StoreCart | undefined, storeId: number): Promise<EnrichedStoreCart> {
  if (!cart) {
    return { storeId, items: [], subtotal: 0, itemCount: 0, expiresAt: null };
  }

  const [products, promotions] = await Promise.all([
    genFebStorage.listStoreProducts(storeId),
    genFebStorage.listStorePromotions(storeId),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const promotionById = new Map(promotions.map((p) => [p.id, p]));

  const items: EnrichedStoreCartLine[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const line of cart.items) {
    const valid = await isValidCartItem(storeId, line, products, promotions);
    if (!valid) continue;

    if (line.kind === "product") {
      const product = productById.get(line.productId);
      if (!product) continue;
      const lineTotal = product.price * line.quantity;
      subtotal += lineTotal;
      itemCount += line.quantity;
      items.push({
        kind: "product",
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: line.quantity,
        lineTotal,
        imageUrl: product.imageUrls?.[0]?.trim() ?? null,
      });
      continue;
    }

    const promotion = promotionById.get(line.promotionId);
    if (!promotion) continue;
    const lineTotal = promotion.price * line.quantity;
    subtotal += lineTotal;
    itemCount += line.quantity;
    const imageUrl =
      promotion.items
        .map((i) => productById.get(i.productId)?.imageUrls?.[0]?.trim())
        .find((url) => Boolean(url)) ?? null;
    items.push({
      kind: "promotion",
      promotionId: promotion.id,
      name: promotion.name,
      price: promotion.price,
      quantity: line.quantity,
      lineTotal,
      imageUrl: imageUrl ?? null,
    });
  }

  const expiresAt =
    cart.expiresAt instanceof Date
      ? cart.expiresAt.toISOString()
      : new Date(cart.expiresAt).toISOString();

  return { storeId, items, subtotal, itemCount, expiresAt };
}

export async function validateCartItemForStore(storeId: number, item: StoreCartItem): Promise<void> {
  const [products, promotions] = await Promise.all([
    genFebStorage.listStoreProducts(storeId),
    genFebStorage.listStorePromotions(storeId),
  ]);
  const ok = await isValidCartItem(storeId, item, products, promotions);
  if (!ok) throw new Error("STORE_CART_ITEM_INVALID");
}

export async function pruneAndSaveCart(userId: string, cart: StoreCart): Promise<StoreCart> {
  const [products, promotions] = await Promise.all([
    genFebStorage.listStoreProducts(cart.storeId),
    genFebStorage.listStorePromotions(cart.storeId),
  ]);
  const validItems: StoreCartItem[] = [];
  for (const item of cart.items) {
    if (await isValidCartItem(cart.storeId, item, products, promotions)) {
      validItems.push(item);
    }
  }
  if (validItems.length === cart.items.length) return cart;
  return genFebStorage.saveStoreCart(userId, cart.storeId, validItems);
}
