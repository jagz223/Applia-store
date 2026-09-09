import type {
  AddStoreCartItem,
  RemoveStoreCartItem,
  StoreCart,
  StoreCartItem,
  StoreCartProductItem,
  UpdateStoreCartItem,
} from "@shared/store-cart-schema";
import {
  buildCustomizedProductDisplayName,
  normalizeCartCustomizationIds,
  storeCartProductLineKey,
} from "@shared/store-cart-schema";
import {
  isStoreFulfillmentModeEnabled,
  normalizeStoreFulfillmentOptions,
  STORE_FULFILLMENT_LABELS,
  type StoreFulfillmentMode,
} from "@shared/store-fulfillment";
import type { StoreProduct, StorePromotion, StoreLocation, StoreDeliveryFares, StoreBranch } from "@shared/store-schema";
import {
  computeCartDeliveryWeightKg,
  normalizeStoreCurrencyFields,
  normalizeStoreDeliveryFares,
  normalizeStoreLocation,
  normalizeStoreBranches,
  resolveAdditionalDisplayPrice,
  resolveStorePromotionImageUrl,
  storeProductHasAvailableStock,
} from "@shared/store-schema";
import type { StoreCheckoutPaymentMethod } from "@shared/store-order-schema";
import { isCasheaPaymentMethod } from "@shared/store-cashea";
import { parseStorePaymentGatewayKind } from "@shared/store-payment-gateways";
import { resolveProductDisplayPrice } from "@shared/store-currency-schema";
import type { StoreCurrencyExtra } from "@shared/store-currency-schema";
import { priceWithIva } from "@shared/store-price-iva";
import { appliaStorage } from "./storage-applia";

export type EnrichedStoreCartLine = {
  kind: "product" | "promotion";
  /** Clave estable de línea (variantes de personalización incluidas). */
  lineKey: string;
  productId?: number;
  promotionId?: number;
  sizeId?: string | null;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
  secondaryImageUrl?: string | null;
  removedIngredientMaterialIds?: number[];
  additionalIngredientMaterialIds?: number[];
};

export type StoreCartFulfillmentOption = {
  mode: StoreFulfillmentMode;
  label: string;
};

export type EnrichedStoreCart = {
  storeId: number;
  storeName: string | null;
  whatsappPhone: string | null;
  items: EnrichedStoreCartLine[];
  subtotal: number;
  itemCount: number;
  cartWeightKg: number;
  expiresAt: string | null;
  fulfillmentMode: StoreFulfillmentMode | null;
  fulfillmentOptions: StoreCartFulfillmentOption[];
  paymentMethods: StoreCheckoutPaymentMethod[];
  storeLocation: StoreLocation | null;
  branches: StoreBranch[];
  deliveryFares: StoreDeliveryFares;
  currencyVisualId: string;
  currencyExtras: StoreCurrencyExtra[];
};

export function addBodyToCartItem(body: AddStoreCartItem): StoreCartItem {
  if (body.kind === "product") {
    const sizeId = String(body.sizeId ?? "").trim() || null;
    return {
      kind: "product",
      productId: body.productId!,
      quantity: body.quantity ?? 1,
      sizeId,
      removedIngredientMaterialIds: normalizeCartCustomizationIds(
        body.removedIngredientMaterialIds ?? [],
      ),
      additionalIngredientMaterialIds: normalizeCartCustomizationIds(
        body.additionalIngredientMaterialIds ?? [],
      ),
    };
  }
  return {
    kind: "promotion",
    promotionId: body.promotionId!,
    quantity: Math.min(body.quantity ?? 1, 99),
  };
}

export function cartLineKey(item: StoreCartItem): string {
  if (item.kind === "promotion") return `m:${item.promotionId}`;
  return storeCartProductLineKey({
    productId: item.productId,
    sizeId: item.sizeId,
    removedIngredientMaterialIds: item.removedIngredientMaterialIds,
    additionalIngredientMaterialIds: item.additionalIngredientMaterialIds,
  });
}

function productPatchToKey(patch: {
  productId?: number;
  sizeId?: string | null;
  removedIngredientMaterialIds?: number[];
  additionalIngredientMaterialIds?: number[];
  lineKey?: string;
}): string | null {
  if (patch.lineKey?.trim()) return patch.lineKey.trim();
  if (!patch.productId) return null;
  return storeCartProductLineKey({
    productId: patch.productId,
    sizeId: patch.sizeId,
    removedIngredientMaterialIds: patch.removedIngredientMaterialIds,
    additionalIngredientMaterialIds: patch.additionalIngredientMaterialIds,
  });
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
  if (patch.kind === "promotion") {
    const key = patch.lineKey?.trim() || `m:${patch.promotionId}`;
    if (patch.quantity <= 0) return items.filter((i) => cartLineKey(i) !== key);
    const quantity = Math.min(99, patch.quantity);
    const idx = items.findIndex((i) => cartLineKey(i) === key);
    const incoming: StoreCartItem = {
      kind: "promotion",
      promotionId: patch.promotionId!,
      quantity,
    };
    if (idx === -1) return [...items, incoming];
    return items.map((item, i) => (i === idx ? { ...item, quantity } : item));
  }

  const key = productPatchToKey(patch);
  if (!key) return items;
  if (patch.quantity <= 0) return items.filter((i) => cartLineKey(i) !== key);
  const quantity = Math.min(9999, patch.quantity);
  const idx = items.findIndex((i) => cartLineKey(i) === key);
  const existing = idx >= 0 && items[idx]?.kind === "product" ? (items[idx] as StoreCartProductItem) : null;
  const sizeId =
    String(existing?.sizeId ?? patch.sizeId ?? "").trim() || null;
  const incoming: StoreCartProductItem = {
    kind: "product",
    productId: existing?.productId ?? patch.productId!,
    quantity,
    sizeId,
    removedIngredientMaterialIds: normalizeCartCustomizationIds(
      existing?.removedIngredientMaterialIds ?? patch.removedIngredientMaterialIds ?? [],
    ),
    additionalIngredientMaterialIds: normalizeCartCustomizationIds(
      existing?.additionalIngredientMaterialIds ?? patch.additionalIngredientMaterialIds ?? [],
    ),
  };
  if (idx === -1) return [...items, incoming];
  return items.map((item, i) => (i === idx ? { ...incoming, quantity } : item));
}

export function removeCartItem(items: StoreCartItem[], patch: RemoveStoreCartItem): StoreCartItem[] {
  const key =
    patch.kind === "promotion"
      ? patch.lineKey?.trim() || `m:${patch.promotionId}`
      : productPatchToKey(patch);
  if (!key) return items;
  return items.filter((i) => cartLineKey(i) !== key);
}

function validateProductCustomization(
  product: StoreProduct,
  item: StoreCartProductItem,
): boolean {
  const sizes = product.sizes ?? [];
  const sizeId = String(item.sizeId ?? "").trim();
  if (sizes.length > 0) {
    if (!sizeId || !sizes.some((s) => s.id === sizeId)) return false;
  } else if (sizeId) {
    return false;
  }

  const removed = normalizeCartCustomizationIds(item.removedIngredientMaterialIds ?? []);
  const additionals = normalizeCartCustomizationIds(item.additionalIngredientMaterialIds ?? []);
  const removable = new Set(
    normalizeCartCustomizationIds(product.removableIngredientMaterialIds ?? []),
  );
  const additionalAllowed = new Set(
    (product.ingredientAdditionals ?? []).map((a) => a.ingredientMaterialId),
  );
  for (const id of removed) {
    if (!removable.has(id)) return false;
  }
  for (const id of additionals) {
    if (!additionalAllowed.has(id)) return false;
    if (removed.includes(id)) return false;
  }
  return true;
}

async function isValidCartItem(
  storeId: number,
  item: StoreCartItem,
  products: StoreProduct[],
  promotions: StorePromotion[],
): Promise<boolean> {
  if (item.kind === "product") {
    const product = products.find((p) => p.id === item.productId && p.storeId === storeId);
    if (!product) return false;
    if (!storeProductHasAvailableStock(product)) return false;
    if (product.showOnShowcase === false) return false;
    return validateProductCustomization(product, item);
  }
  const promotion = promotions.find((p) => p.id === item.promotionId && p.storeId === storeId);
  return Boolean(
    promotion &&
      promotion.status === "active" &&
      promotion.items.some((line) => line.status === "active"),
  );
}

async function loadCartLineRecords(storeId: number, items: StoreCartItem[]) {
  const productIds: number[] = [];
  const promotionIds: number[] = [];
  for (const item of items) {
    if (item.kind === "product") productIds.push(item.productId);
    else promotionIds.push(item.promotionId);
  }
  const [products, promotions] = await Promise.all([
    appliaStorage.getStoreProductsByIds(storeId, productIds),
    appliaStorage.getStorePromotionsByIds(storeId, promotionIds),
  ]);
  return { products, promotions };
}

async function loadCartEnrichmentCatalog(storeId: number, items: StoreCartItem[]) {
  const { products, promotions } = await loadCartLineRecords(storeId, items);
  const productById = new Map(products.map((p) => [p.id, p]));
  const nestedIds: number[] = [];
  for (const promotion of promotions) {
    for (const line of promotion.items) {
      if (!productById.has(line.productId)) nestedIds.push(line.productId);
    }
  }
  if (nestedIds.length > 0) {
    const extra = await appliaStorage.getStoreProductsByIds(storeId, nestedIds);
    for (const product of extra) productById.set(product.id, product);
  }
  const ingredientIds: number[] = [];
  for (const item of items) {
    if (item.kind !== "product") continue;
    ingredientIds.push(...(item.removedIngredientMaterialIds ?? []));
    ingredientIds.push(...(item.additionalIngredientMaterialIds ?? []));
  }
  const ingredients = await appliaStorage.getIngredientMaterialsByIds(ingredientIds);
  return {
    products: [...productById.values()],
    promotions,
    ingredients,
  };
}

export async function enrichStoreCart(cart: StoreCart | undefined, storeId: number): Promise<EnrichedStoreCart> {
  const store = await appliaStorage.getStoreById(storeId);
  const storeOptions = normalizeStoreFulfillmentOptions(store?.fulfillmentOptions);
  const fulfillmentOptions: StoreCartFulfillmentOption[] = storeOptions.map((mode) => ({
    mode,
    label: STORE_FULFILLMENT_LABELS[mode],
  }));

  const paymentMethodsRaw = await appliaStorage.listStorePaymentMethods(storeId);
  const paymentMethods: StoreCheckoutPaymentMethod[] = paymentMethodsRaw.map((m) => ({
    id: m.id,
    name: m.name,
    accountNumber: m.accountNumber,
    extraFields: m.extraFields ?? [],
    imageUrl: m.imageUrl ?? null,
    isCashea: isCasheaPaymentMethod(m),
    gatewayKind: parseStorePaymentGatewayKind(m.systemKind),
  }));

  const storeName = store?.name?.trim() ? store.name.trim() : null;
  const whatsappPhone = store?.whatsappPhone ?? null;

  const storeLocation = normalizeStoreLocation(store?.location ?? null);
  const branches = normalizeStoreBranches(store?.branches, storeLocation);
  const deliveryFares = normalizeStoreDeliveryFares(store?.deliveryFares);
  const currency = normalizeStoreCurrencyFields({
    currencyExtras: store?.currencyExtras,
    currencyVisualId: store?.currencyVisualId,
    currencyAcceptedPaymentIds: store?.currencyAcceptedPaymentIds,
  });

  if (!cart || cart.items.length === 0) {
    const fulfillmentMode =
      cart && isStoreFulfillmentModeEnabled(storeOptions, cart.fulfillmentMode)
        ? cart.fulfillmentMode
        : null;
    const expiresAt =
      cart?.expiresAt instanceof Date
        ? cart.expiresAt.toISOString()
        : cart?.expiresAt
          ? new Date(cart.expiresAt).toISOString()
          : null;
    return {
      storeId,
      storeName,
      whatsappPhone,
      items: [],
      subtotal: 0,
      itemCount: 0,
      cartWeightKg: 0,
      expiresAt,
      fulfillmentMode,
      fulfillmentOptions,
      paymentMethods,
      storeLocation,
      branches,
      deliveryFares,
      currencyVisualId: currency.currencyVisualId,
      currencyExtras: currency.currencyExtras,
    };
  }

  const fulfillmentMode = isStoreFulfillmentModeEnabled(storeOptions, cart.fulfillmentMode)
    ? cart.fulfillmentMode
    : null;

  const { products, promotions, ingredients } = await loadCartEnrichmentCatalog(storeId, cart.items);

  const productById = new Map(products.map((p) => [p.id, p]));
  const promotionById = new Map(promotions.map((p) => [p.id, p]));
  const ingredientNameById = new Map(ingredients.map((i) => [i.id, i.name]));
  const visualCurrencyId = currency.currencyVisualId;

  const items: EnrichedStoreCartLine[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const line of cart.items) {
    const valid = await isValidCartItem(storeId, line, products, promotions);
    if (!valid) continue;

    if (line.kind === "product") {
      const product = productById.get(line.productId);
      if (!product) continue;
      const sizeId = String(line.sizeId ?? "").trim() || null;
      const size = sizeId ? (product.sizes ?? []).find((s) => s.id === sizeId) : undefined;
      const removed = normalizeCartCustomizationIds(line.removedIngredientMaterialIds ?? []);
      const additionals = normalizeCartCustomizationIds(line.additionalIngredientMaterialIds ?? []);
      const extrasPrice = additionals.reduce((sum, id) => {
        const row = (product.ingredientAdditionals ?? []).find((a) => a.ingredientMaterialId === id);
        if (!row) return sum;
        return (
          sum + priceWithIva(resolveAdditionalDisplayPrice(row, visualCurrencyId, sizeId))
        );
      }, 0);
      const basePrice = priceWithIva(
        size
          ? resolveProductDisplayPrice(
              { price: 0, pricesByCurrency: size.pricesByCurrency },
              visualCurrencyId,
            )
          : resolveProductDisplayPrice(product, visualCurrencyId),
      );
      const unitPrice = basePrice + extrasPrice;
      const additionalNames = additionals.map(
        (id) => ingredientNameById.get(id) ?? `Item #${id}`,
      );
      const removedNames = removed.map(
        (id) => ingredientNameById.get(id) ?? `Item #${id}`,
      );
      const displayName = buildCustomizedProductDisplayName(
        product.name,
        additionalNames,
        removedNames,
        size?.name,
      );
      const lineTotal = unitPrice * line.quantity;
      subtotal += lineTotal;
      itemCount += line.quantity;
      items.push({
        kind: "product",
        lineKey: cartLineKey(line),
        productId: product.id,
        sizeId,
        name: displayName,
        price: unitPrice,
        quantity: line.quantity,
        lineTotal,
        imageUrl: product.imageUrls?.[0]?.trim() ?? null,
        secondaryImageUrl: product.imageUrls?.[1]?.trim() ?? null,
        removedIngredientMaterialIds: removed,
        additionalIngredientMaterialIds: additionals,
      });
      continue;
    }

    const promotion = promotionById.get(line.promotionId);
    if (!promotion) continue;
    const unitPrice = priceWithIva(promotion.price);
    const lineTotal = unitPrice * line.quantity;
    subtotal += lineTotal;
    itemCount += line.quantity;
    const imageUrl = resolveStorePromotionImageUrl(promotion, products);
    items.push({
      kind: "promotion",
      lineKey: cartLineKey(line),
      promotionId: promotion.id,
      name: promotion.name,
      price: unitPrice,
      quantity: line.quantity,
      lineTotal,
      imageUrl: imageUrl ?? null,
      secondaryImageUrl: null,
    });
  }

  const expiresAt =
    cart.expiresAt instanceof Date
      ? cart.expiresAt.toISOString()
      : new Date(cart.expiresAt).toISOString();

  const cartWeightKg = computeCartDeliveryWeightKg(items, products, promotions);

  return {
    storeId,
    storeName,
    whatsappPhone,
    items,
    subtotal,
    itemCount,
    cartWeightKg,
    expiresAt,
    fulfillmentMode,
    fulfillmentOptions,
    paymentMethods,
    storeLocation,
    branches,
    deliveryFares,
    currencyVisualId: currency.currencyVisualId,
    currencyExtras: currency.currencyExtras,
  };
}

export async function validateCheckoutPaymentMethod(
  storeId: number,
  paymentMethodId: number,
): Promise<void> {
  const method = await appliaStorage.getStorePaymentMethod(storeId, paymentMethodId);
  if (!method) throw new Error("STORE_PAYMENT_METHOD_NOT_FOUND");
  if (isCasheaPaymentMethod(method)) throw new Error("STORE_CASHEA_WHATSAPP_ONLY");
}

export async function validateCheckoutFulfillment(
  storeId: number,
  fulfillmentMode: StoreFulfillmentMode | null | undefined,
): Promise<StoreFulfillmentMode | null> {
  const store = await appliaStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  const storeOptions = normalizeStoreFulfillmentOptions(store.fulfillmentOptions);
  if (storeOptions.length === 0) return null;
  if (!fulfillmentMode || !isStoreFulfillmentModeEnabled(storeOptions, fulfillmentMode)) {
    throw new Error("STORE_CART_FULFILLMENT_INVALID");
  }
  return fulfillmentMode;
}

export async function validateCartFulfillmentForStore(
  storeId: number,
  fulfillmentMode: StoreFulfillmentMode | null,
): Promise<void> {
  if (fulfillmentMode == null) return;
  const store = await appliaStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  const storeOptions = normalizeStoreFulfillmentOptions(store.fulfillmentOptions);
  if (!isStoreFulfillmentModeEnabled(storeOptions, fulfillmentMode)) {
    throw new Error("STORE_CART_FULFILLMENT_INVALID");
  }
}

export async function validateCartItemForStore(storeId: number, item: StoreCartItem): Promise<void> {
  if (item.kind === "product") {
    const product = await appliaStorage.getStoreProduct(storeId, item.productId);
    if (product && !storeProductHasAvailableStock(product)) {
      throw new Error("STORE_PRODUCT_NO_STOCK");
    }
    const ok = await isValidCartItem(storeId, item, product ? [product] : [], []);
    if (!ok) throw new Error("STORE_CART_ITEM_INVALID");
    return;
  }
  const promotion = await appliaStorage.getStorePromotion(storeId, item.promotionId);
  const ok = await isValidCartItem(storeId, item, [], promotion ? [promotion] : []);
  if (!ok) throw new Error("STORE_CART_ITEM_INVALID");
}

export async function pruneAndSaveCart(userId: string, cart: StoreCart): Promise<StoreCart> {
  if (cart.items.length === 0) return cart;
  const { products, promotions } = await loadCartLineRecords(cart.storeId, cart.items);
  const validItems: StoreCartItem[] = [];
  for (const item of cart.items) {
    if (await isValidCartItem(cart.storeId, item, products, promotions)) {
      validItems.push(item);
    }
  }
  if (validItems.length === cart.items.length) return cart;
  return appliaStorage.saveStoreCart(userId, cart.storeId, validItems);
}
