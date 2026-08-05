/**
 * API REST — módulo Tiendas (Prompt 1).
 *
 * Pruebas manuales (reemplaza TOKEN y ajusta host):
 *
 * # Crear tienda
 * curl -s -X POST http://localhost:5000/api/stores \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Mi Tienda Demo"}'
 *
 * # Mi tienda
 * curl -s http://localhost:5000/api/stores/mine -H "Authorization: Bearer TOKEN"
 *
 * # Tienda pública por slug
 * curl -s http://localhost:5000/api/stores/mi-tienda-demo
 *
 * # Listar ingredientes/materiales (página 1, filtro opcional)
 * curl -s "http://localhost:5000/api/ingredients-materials?q=harina&page=1"
 *
 * # Crear ingrediente/material global
 * curl -s -X POST http://localhost:5000/api/ingredients-materials \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Harina de trigo"}'
 *
 * # Cotización mensualidad tienda (público)
 * curl -s http://localhost:5000/api/stores/subscription-quote
 */
import type { Express } from "express";
import { z } from "zod";
import { authenticateJWT, optionalAuthenticateJWT } from "./routes-auth";
import { appliaStorage } from "./storage-applia";
import { getStoreSubscriptionQuote } from "./store-subscription";
import {
  storeHasPendingSubscriptionPayment,
  submitStoreSubscriptionPayment,
  repairStoreSubscriptionVisibilityIfNeeded,
} from "./store-subscription-payments";
import {
  assertStoreCategoryIds,
  productIdsForCategory,
  removeCategoryFromAllProducts,
  syncCategoryProductMembership,
} from "./store-category-sync";
import { computeStoreDeliveryQuote } from "./store-delivery-quote";
import {
  getStoreDeliveryNotificationsSummary,
  handleStoreOrderStatusListoParaEnvio,
  handleStoreOrderRevertFromListoParaEnvio,
} from "./store-order-delivery";
import {
  notifyCustomerStoreOrderStatusChanged,
  notifyStoreOwnerNewOrder,
} from "./store-order-notifications";
import { getPackRideDeliveryDetail } from "./pack-rides";
import {
  insertStoreSchema,
  insertIngredientMaterialSchema,
  insertStoreProductSchema,
  updateStoreProductSchema,
  updateStoreSchema,
  insertStoreCategorySchema,
  updateStoreCategorySchema,
  insertStorePromotionSchema,
  updateStorePromotionSchema,
  INGREDIENTS_MATERIALS_PAGE_SIZE,
  type Store,
  type StoreProduct,
  type StoreCategory,
  type StorePromotion,
  resolveStorePromotionImageUrl,
  canEnableStoreFulfillmentOptions,
  STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE,
  normalizeStoreLocation,
  normalizeStoreCurrencyFields,
  normalizeStoreDeliveryFares,
} from "@shared/store-schema";
import {
  DOLARAPI_VE_BASE,
  currencyLabelForId,
  parseDolarApiRate,
  resolveProductDisplayPrice,
  STORE_CURRENCY_USD_ID,
} from "@shared/store-currency-schema";
import { storeSubscriptionPaymentBodySchema } from "@shared/store-subscription-payment";
import { isStoreVisibilityActive } from "@shared/store-visibility";
import { filterStoresByCatalogQuery, getStoreRubroLabel } from "@shared/store-rubros";
import { parsePositiveIntParam, requireStoreOwner, viewerCanManageStore } from "./store-product-auth";
import { hasAdminPrivileges } from "@shared/roles";
import {
  addStoreCartItemSchema,
  updateStoreCartItemSchema,
  removeStoreCartItemSchema,
  updateStoreCartFulfillmentSchema,
} from "@shared/store-cart-schema";
import { submitStoreCheckoutSchema, updateStoreOrderStatusSchema, canTransitionStoreOrderStatus, STORE_ORDER_STATUS_LABELS, fulfillmentLabel, getAllowedStoreOrderStatuses, getStoreOrderStatusTransitionLabel, storeOrderStatusSchema, parseStoreOrderDateFilter, canGenerateStoreOrderInvoice, type StoreOrder } from "@shared/store-order-schema";
import {
  insertStorePaymentMethodSchema,
  updateStorePaymentMethodSchema,
  formatStorePaymentMethodExtraFieldsAsText,
  type StorePaymentMethod,
} from "@shared/store-payment-method-schema";
import { normalizeStoreFulfillmentOptions } from "@shared/store-fulfillment";
import {
  addBodyToCartItem,
  enrichStoreCart,
  mergeAddCartItem,
  pruneAndSaveCart,
  removeCartItem,
  setCartItemQuantity,
  validateCartFulfillmentForStore,
  validateCartItemForStore,
  validateCheckoutFulfillment,
  validateCheckoutPaymentMethod,
} from "./store-cart";

function serializeDate(value: Date | string | number | null | undefined | unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "object") {
    const o = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    };
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
      } catch {
        return null;
      }
    }
    if (typeof o.toMillis === "function") {
      try {
        const ms = o.toMillis();
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
      } catch {
        return null;
      }
    }
    const sec = o.seconds ?? o._seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      const nano = o.nanoseconds ?? o._nanoseconds ?? 0;
      return new Date(sec * 1000 + (typeof nano === "number" ? nano / 1e6 : 0)).toISOString();
    }
  }
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function serializeStoreProduct(
  product: StoreProduct,
  storeCurrency?: { visualCurrencyId?: string; currencyExtras?: { id: string; name: string; value: string }[] },
) {
  const visualCurrencyId = storeCurrency?.visualCurrencyId ?? STORE_CURRENCY_USD_ID;
  const displayPrice = resolveProductDisplayPrice(product, visualCurrencyId);
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description: product.description,
    price: displayPrice,
    pricesByCurrency: product.pricesByCurrency ?? {},
    displayCurrencyId: visualCurrencyId,
    displayCurrencyLabel: currencyLabelForId(
      visualCurrencyId,
      storeCurrency?.currencyExtras ?? [],
    ),
    categoryIds: product.categoryIds,
    ingredientMaterialIds: product.ingredientMaterialIds,
    removableIngredientMaterialIds: product.removableIngredientMaterialIds ?? [],
    ingredientAdditionals: product.ingredientAdditionals ?? [],
    imageUrls: product.imageUrls ?? [],
    showOnShowcase: product.showOnShowcase !== false,
    createdAt: serializeDate(product.createdAt),
    updatedAt: serializeDate(product.updatedAt),
  };
}

function serializeStoreCategory(category: StoreCategory, products: StoreProduct[]) {
  const ids = productIdsForCategory(products, category.id);
  return {
    id: category.id,
    storeId: category.storeId,
    name: category.name,
    description: category.description,
    productIds: ids,
    productCount: ids.length,
    createdAt: serializeDate(category.createdAt),
    updatedAt: serializeDate(category.updatedAt),
  };
}

async function assertStoreProductIds(storeId: number, productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  const products = await appliaStorage.listStoreProducts(storeId);
  const valid = new Set(products.map((p) => p.id));
  for (const id of productIds) {
    if (!valid.has(id)) throw new Error("STORE_PRODUCT_INVALID");
  }
}

function serializeStorePromotion(promotion: StorePromotion, products: StoreProduct[]) {
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  return {
    id: promotion.id,
    storeId: promotion.storeId,
    name: promotion.name,
    description: promotion.description,
    imageUrl: promotion.imageUrl ?? null,
    price: promotion.price,
    status: promotion.status,
    items: promotion.items.map((item) => ({
      productId: item.productId,
      productName: nameById.get(item.productId) ?? `Producto #${item.productId}`,
      quantity: item.quantity,
      status: item.status,
    })),
    createdAt: serializeDate(promotion.createdAt),
    updatedAt: serializeDate(promotion.updatedAt),
  };
}

async function assertStorePromotionItems(
  storeId: number,
  items: { productId: number }[] | undefined,
): Promise<void> {
  if (!items?.length) return;
  await assertStoreProductIds(
    storeId,
    items.map((i) => i.productId),
  );
}

function serializeStoreShowcaseProduct(
  product: StoreProduct,
  store: Store,
  ingredientNameById: Map<number, string> = new Map(),
) {
  const currency = normalizeStoreCurrencyFields(store);
  const displayPrice = resolveProductDisplayPrice(product, currency.currencyVisualId);
  const ingredientMaterialIds = product.ingredientMaterialIds ?? [];
  const removableIngredientMaterialIds = product.removableIngredientMaterialIds ?? [];
  const ingredientAdditionals = product.ingredientAdditionals ?? [];
  const resolveName = (id: number) => ingredientNameById.get(id) ?? `Item #${id}`;
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: displayPrice,
    pricesByCurrency: product.pricesByCurrency ?? {},
    displayCurrencyId: currency.currencyVisualId,
    displayCurrencyLabel: currencyLabelForId(currency.currencyVisualId, currency.currencyExtras),
    imageUrls: product.imageUrls ?? [],
    categoryIds: product.categoryIds ?? [],
    ingredients: ingredientMaterialIds.map((id) => ({ id, name: resolveName(id) })),
    removableIngredients: removableIngredientMaterialIds.map((id) => ({
      id,
      name: resolveName(id),
    })),
    additionals: ingredientAdditionals.map((a) => ({
      id: a.ingredientMaterialId,
      name: resolveName(a.ingredientMaterialId),
      price: a.price,
    })),
  };
}

function assertProductPricesForAcceptedCurrencies(
  store: Store,
  pricesByCurrency: Record<string, number> | undefined,
): string | null {
  const currency = normalizeStoreCurrencyFields(store);
  const map = pricesByCurrency ?? {};
  for (const id of currency.currencyAcceptedPaymentIds) {
    const value = map[id];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      const label = currencyLabelForId(id, currency.currencyExtras);
      return `Falta el precio en ${label}.`;
    }
  }
  return null;
}

function serializeShowcaseCategory(category: StoreCategory) {
  return {
    id: category.id,
    name: category.name,
  };
}

function serializeStoreShowcasePromotion(promotion: StorePromotion, products: StoreProduct[]) {
  const productById = new Map(products.map((p) => [p.id, p]));
  const imageUrl = resolveStorePromotionImageUrl(promotion, products);

  return {
    id: promotion.id,
    name: promotion.name,
    description: promotion.description,
    price: promotion.price,
    imageUrl,
    promotionImageUrl: promotion.imageUrl?.trim() || null,
    items: promotion.items
      .filter((item) => item.status === "active")
      .map((item) => ({
        productId: item.productId,
        productName: productById.get(item.productId)?.name ?? `Producto #${item.productId}`,
        quantity: item.quantity,
      })),
  };
}

function serializeStoreCatalogItem(store: Store) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description ?? null,
    rubro: store.rubro ?? null,
    rubroLabel: getStoreRubroLabel(store.rubro),
    coverImageUrl: store.coverImageUrl ?? null,
  };
}

function serializeStorePaymentMethod(method: StorePaymentMethod) {
  return {
    id: method.id,
    storeId: method.storeId,
    name: method.name,
    accountNumber: method.accountNumber,
    extraFields: method.extraFields ?? [],
    imageUrl: method.imageUrl ?? null,
    createdAt: serializeDate(method.createdAt),
    updatedAt: serializeDate(method.updatedAt),
  };
}

async function serializeStoreOrder(
  order: StoreOrder,
  includeAllowedStatuses = false,
  storeOverride?: Store | null,
) {
  const user = (await appliaStorage.getUserById(order.userId)) as
    | { name?: string; firstName?: string; lastName?: string; email?: string }
    | undefined;
  const store = storeOverride ?? (await appliaStorage.getStoreById(order.storeId));
  const storeLocation = normalizeStoreLocation(store?.location ?? null);
  const customerName = user
    ? [user.name ?? user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null
    : null;
  const base = {
    id: order.id,
    storeId: order.storeId,
    storeName: store?.name ?? null,
    storeSlug: store?.slug ?? null,
    userId: order.userId,
    customerName,
    customerEmail: user?.email ?? null,
    storeLocation,
    paymentMethodId: order.paymentMethodId,
    paymentMethodName: order.paymentMethodName,
    paymentMethodAccountNumber: order.paymentMethodAccountNumber,
    fulfillmentMode: order.fulfillmentMode,
    fulfillmentLabel: fulfillmentLabel(order.fulfillmentMode),
    reference: order.reference,
    proofImageUrl: order.proofImageUrl,
    amountDue: order.amountDue,
    amountPaid: order.amountPaid,
    deliveryFee: order.deliveryFee ?? 0,
    deliveryDistanceM: order.deliveryDistanceM ?? null,
    subtotal: order.subtotal,
    deliveryLocation: order.deliveryLocation,
    items: order.items,
    status: order.status,
    statusLabel: STORE_ORDER_STATUS_LABELS[order.status],
    packRideId: order.packRideId ?? null,
    deliveryUnreadCount: order.deliveryUnreadCount ?? 0,
    createdAt: serializeDate(order.createdAt),
    updatedAt: serializeDate(order.updatedAt),
  };
  if (!includeAllowedStatuses) return base;
  return {
    ...base,
    allowedNextStatuses: getAllowedStoreOrderStatuses(order).map((status) => ({
      status,
      label: getStoreOrderStatusTransitionLabel(order.status, status),
    })),
  };
}

function serializeStore(
  store: Store,
  extra?: { hasPendingSubscriptionPayment?: boolean; isOwner?: boolean },
) {
  return {
    id: store.id,
    ownerUserId: store.ownerUserId,
    name: store.name,
    slug: store.slug,
    description: store.description ?? null,
    rubro: store.rubro ?? null,
    rubroLabel: getStoreRubroLabel(store.rubro),
    coverImageUrl: store.coverImageUrl ?? null,
    location: store.location ?? null,
    fulfillmentOptions: normalizeStoreFulfillmentOptions(store.fulfillmentOptions),
    deliveryFares: normalizeStoreDeliveryFares(store.deliveryFares),
    ...(() => {
      const currency = normalizeStoreCurrencyFields(store);
      return {
        currencyExtras: currency.currencyExtras,
        currencyVisualId: currency.currencyVisualId,
        currencyAcceptedPaymentIds: currency.currencyAcceptedPaymentIds,
      };
    })(),
    visibilitySubscriptionEndsAt: serializeDate(store.visibilitySubscriptionEndsAt),
    visibilityActive: isStoreVisibilityActive(store),
    hasPendingSubscriptionPayment: extra?.hasPendingSubscriptionPayment ?? false,
    isOwner: extra?.isOwner,
    createdAt: serializeDate(store.createdAt),
    updatedAt: serializeDate(store.updatedAt),
  };
}

const ingredientsListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
});

const storesCatalogQuerySchema = z.object({
  q: z.string().optional(),
  rubro: z.string().optional(),
});

export function registerStoreRoutes(app: Express): void {
  app.get("/api/currency/bcv", async (_req, res) => {
    try {
      const [usdRes, eurRes] = await Promise.all([
        fetch(`${DOLARAPI_VE_BASE}/v1/dolares/oficial`),
        fetch(`${DOLARAPI_VE_BASE}/v1/euros/oficial`),
      ]);
      if (!usdRes.ok || !eurRes.ok) {
        return res.status(502).json({ message: "No se pudieron obtener las tasas BCV." });
      }
      const [usdJson, eurJson] = await Promise.all([usdRes.json(), eurRes.json()]);
      const dollar = parseDolarApiRate(usdJson, "USD", "REF");
      const euro = parseDolarApiRate(eurJson, "EUR", "Euro");
      if (!dollar || !euro) {
        return res.status(502).json({ message: "Respuesta inválida de DolarApi." });
      }
      return res.json({
        source: "dolarapi",
        provider: DOLARAPI_VE_BASE,
        dollar,
        euro,
      });
    } catch (e) {
      console.error("[currency] bcv", e);
      return res.status(502).json({ message: "No se pudieron obtener las tasas BCV." });
    }
  });

  app.get("/api/stores/subscription-quote", async (_req, res) => {
    try {
      const quote = await getStoreSubscriptionQuote();
      return res.json(quote);
    } catch (e) {
      console.error("[stores] subscription-quote", e);
      return res.status(500).json({ message: "No se pudo obtener la cotización de la tienda." });
    }
  });

  app.post("/api/stores", authenticateJWT, async (req: any, res) => {
    try {
      const parsed = insertStoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const role = String(req.user?.role ?? "");
      let isAdmin = hasAdminPrivileges(role);
      if (!isAdmin) {
        const dbUser = await appliaStorage.getUserById(userId);
        isAdmin = hasAdminPrivileges((dbUser as { role?: string } | undefined)?.role);
      }
      if (!isAdmin) {
        return res.status(403).json({ message: "Solo un administrador puede crear la tienda." });
      }

      const existing = await appliaStorage.getOldestStore();
      if (existing) {
        return res.status(409).json({
          message: "Ya existe una tienda en el sistema.",
          store: serializeStoreCatalogItem(existing),
        });
      }

      const store = await appliaStorage.createStore({
        ownerUserId: userId,
        name: parsed.data.name,
      });
      return res.status(201).json({ store: serializeStore(store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ALREADY_EXISTS") {
        return res.status(409).json({ message: "Ya tienes una tienda registrada." });
      }
      console.error("[stores] create", e);
      return res.status(500).json({ message: "No se pudo crear la tienda." });
    }
  });

  app.get("/api/stores/mine", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      let store = await appliaStorage.getStoreByOwnerUserId(userId);
      if (!store) {
        const dbUser = await appliaStorage.getUserById(userId);
        const admin =
          hasAdminPrivileges(req.user?.role) ||
          hasAdminPrivileges((dbUser as { role?: string } | undefined)?.role);
        if (admin) {
          store = (await appliaStorage.getOldestStore()) ?? undefined;
        }
      }
      if (!store) return res.status(404).json({ message: "Aún no tienes una tienda." });
      const repaired = await repairStoreSubscriptionVisibilityIfNeeded(store);
      const hasPending = await storeHasPendingSubscriptionPayment(repaired.id);
      return res.json({
        store: serializeStore(repaired, { hasPendingSubscriptionPayment: hasPending, isOwner: true }),
      });
    } catch (e) {
      console.error("[stores] mine", e);
      return res.status(500).json({ message: "No se pudo cargar tu tienda." });
    }
  });

  app.patch("/api/stores/mine", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      let store = await appliaStorage.getStoreByOwnerUserId(userId);
      if (!store) {
        const dbUser = await appliaStorage.getUserById(userId);
        const admin =
          hasAdminPrivileges(req.user?.role) ||
          hasAdminPrivileges((dbUser as { role?: string } | undefined)?.role);
        if (admin) {
          store = (await appliaStorage.getOldestStore()) ?? undefined;
        }
      }
      if (!store) return res.status(404).json({ message: "Aún no tienes una tienda." });
      const canManage = await viewerCanManageStore(userId, store, req.user?.role);
      if (!canManage) return res.status(403).json({ message: "No tienes permiso para editar esta tienda." });
      const parsed = updateStoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const nextFulfillment =
        parsed.data.fulfillmentOptions !== undefined
          ? normalizeStoreFulfillmentOptions(parsed.data.fulfillmentOptions)
          : normalizeStoreFulfillmentOptions(store.fulfillmentOptions);
      const nextLocation =
        parsed.data.location !== undefined ? parsed.data.location : store.location;
      if (!canEnableStoreFulfillmentOptions(nextFulfillment, nextLocation)) {
        return res.status(400).json({ message: STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE });
      }
      const updated = await appliaStorage.updateStore(store.id, parsed.data);
      const hasPending = await storeHasPendingSubscriptionPayment(updated.id);
      return res.json({
        store: serializeStore(updated, { hasPendingSubscriptionPayment: hasPending, isOwner: true }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      console.error("[stores] update mine", e);
      return res.status(500).json({ message: "No se pudo actualizar la tienda." });
    }
  });

  app.get("/api/stores", async (req, res) => {
    try {
      const parsed = storesCatalogQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Parámetros inválidos.", errors: parsed.error.errors });
      }
      const stores = await appliaStorage.listActiveStores({ limit: 200 });
      const filtered = filterStoresByCatalogQuery(stores, {
        q: parsed.data.q,
        rubro: parsed.data.rubro,
      });
      return res.json({ stores: filtered.map(serializeStoreCatalogItem) });
    } catch (e) {
      console.error("[stores] catalog list", e);
      return res.status(500).json({ message: "No se pudo cargar el catálogo de tiendas." });
    }
  });

  /** Tienda única del sistema: la de menor id en BD (tienda nº 1), o null si no hay ninguna. */
  app.get("/api/stores/primary", async (_req, res) => {
    try {
      const store = await appliaStorage.getOldestStore();
      if (!store) return res.json({ store: null });
      return res.json({ store: serializeStoreCatalogItem(store) });
    } catch (e) {
      console.error("[stores] primary", e);
      return res.status(500).json({ message: "No se pudo resolver la tienda principal." });
    }
  });

  app.patch("/api/stores/:storeId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const existing = await appliaStorage.getStoreById(storeId);
      if (!existing) return res.status(404).json({ message: "Tienda no encontrada." });
      const nextFulfillment =
        parsed.data.fulfillmentOptions !== undefined
          ? normalizeStoreFulfillmentOptions(parsed.data.fulfillmentOptions)
          : normalizeStoreFulfillmentOptions(existing.fulfillmentOptions);
      const nextLocation =
        parsed.data.location !== undefined ? parsed.data.location : existing.location;
      if (!canEnableStoreFulfillmentOptions(nextFulfillment, nextLocation)) {
        return res.status(400).json({ message: STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE });
      }
      const store = await appliaStorage.updateStore(storeId, parsed.data);
      return res.json({ store: serializeStore(store, { isOwner: true }) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] update", e);
      return res.status(500).json({ message: "No se pudo actualizar la tienda." });
    }
  });

  app.post("/api/stores/:storeId/subscription-payment", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = Number(req.params.storeId);
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ message: "ID de tienda inválido." });
      }
      const parsed = storeSubscriptionPaymentBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const result = await submitStoreSubscriptionPayment({
        userId,
        storeId,
        body: parsed.data,
      });
      return res.status(201).json({
        reportId: result.reportId,
        message: "Comprobante registrado. El equipo lo revisará pronto.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PAYMENT_ALREADY_PENDING") {
        return res.status(409).json({ message: "Ya hay un comprobante en revisión. Espera la validación del equipo." });
      }
      console.error("[stores] subscription-payment", e);
      return res.status(500).json({ message: "No se pudo registrar el comprobante." });
    }
  });

  app.get("/api/stores/:storeId/categories", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const [categories, products] = await Promise.all([
        appliaStorage.listStoreCategories(storeId),
        appliaStorage.listStoreProducts(storeId),
      ]);
      return res.json({ categories: categories.map((c) => serializeStoreCategory(c, products)) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] list categories", e);
      return res.status(500).json({ message: "No se pudieron cargar las categorías." });
    }
  });

  app.post("/api/stores/:storeId/categories", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = insertStoreCategorySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const productIds = parsed.data.productIds ?? [];
      await assertStoreProductIds(storeId, productIds);
      const category = await appliaStorage.createStoreCategory(storeId, {
        name: parsed.data.name,
        description: parsed.data.description,
      });
      await syncCategoryProductMembership(storeId, category.id, productIds);
      const products = await appliaStorage.listStoreProducts(storeId);
      return res.status(201).json({ category: serializeStoreCategory(category, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PRODUCT_INVALID") {
        return res.status(400).json({ message: "Uno o más productos no pertenecen a esta tienda." });
      }
      console.error("[stores] create category", e);
      return res.status(500).json({ message: "No se pudo crear la categoría." });
    }
  });

  app.get("/api/stores/:storeId/categories/:categoryId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const categoryId = parsePositiveIntParam(req.params.categoryId);
      if (!storeId || !categoryId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const category = await appliaStorage.getStoreCategory(storeId, categoryId);
      if (!category) return res.status(404).json({ message: "Categoría no encontrada." });
      const products = await appliaStorage.listStoreProducts(storeId);
      return res.json({ category: serializeStoreCategory(category, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] get category", e);
      return res.status(500).json({ message: "No se pudo cargar la categoría." });
    }
  });

  app.patch("/api/stores/:storeId/categories/:categoryId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const categoryId = parsePositiveIntParam(req.params.categoryId);
      if (!storeId || !categoryId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStoreCategorySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      if (parsed.data.productIds != null) {
        await assertStoreProductIds(storeId, parsed.data.productIds);
      }
      const category = await appliaStorage.updateStoreCategory(storeId, categoryId, {
        name: parsed.data.name,
        description: parsed.data.description,
      });
      if (parsed.data.productIds != null) {
        await syncCategoryProductMembership(storeId, categoryId, parsed.data.productIds);
      }
      const products = await appliaStorage.listStoreProducts(storeId);
      return res.json({ category: serializeStoreCategory(category, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_CATEGORY_NOT_FOUND") return res.status(404).json({ message: "Categoría no encontrada." });
      if (msg === "STORE_PRODUCT_INVALID") {
        return res.status(400).json({ message: "Uno o más productos no pertenecen a esta tienda." });
      }
      console.error("[stores] update category", e);
      return res.status(500).json({ message: "No se pudo actualizar la categoría." });
    }
  });

  app.delete("/api/stores/:storeId/categories/:categoryId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const categoryId = parsePositiveIntParam(req.params.categoryId);
      if (!storeId || !categoryId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      await removeCategoryFromAllProducts(storeId, categoryId);
      await appliaStorage.deleteStoreCategory(storeId, categoryId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_CATEGORY_NOT_FOUND") return res.status(404).json({ message: "Categoría no encontrada." });
      console.error("[stores] delete category", e);
      return res.status(500).json({ message: "No se pudo eliminar la categoría." });
    }
  });

  app.get("/api/stores/:storeId/promotions", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const [promotions, products] = await Promise.all([
        appliaStorage.listStorePromotions(storeId),
        appliaStorage.listStoreProducts(storeId),
      ]);
      return res.json({ promotions: promotions.map((p) => serializeStorePromotion(p, products)) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] list promotions", e);
      return res.status(500).json({ message: "No se pudieron cargar las promociones." });
    }
  });

  app.post("/api/stores/:storeId/promotions", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = insertStorePromotionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      await assertStorePromotionItems(storeId, parsed.data.items);
      const promotion = await appliaStorage.createStorePromotion(storeId, parsed.data);
      const products = await appliaStorage.listStoreProducts(storeId);
      return res.status(201).json({ promotion: serializeStorePromotion(promotion, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PRODUCT_INVALID") {
        return res.status(400).json({ message: "Uno o más productos no pertenecen a esta tienda." });
      }
      console.error("[stores] create promotion", e);
      return res.status(500).json({ message: "No se pudo crear la promoción." });
    }
  });

  app.get("/api/stores/:storeId/promotions/:promotionId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const promotionId = parsePositiveIntParam(req.params.promotionId);
      if (!storeId || !promotionId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const promotion = await appliaStorage.getStorePromotion(storeId, promotionId);
      if (!promotion) return res.status(404).json({ message: "Promoción no encontrada." });
      const products = await appliaStorage.listStoreProducts(storeId);
      return res.json({ promotion: serializeStorePromotion(promotion, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] get promotion", e);
      return res.status(500).json({ message: "No se pudo cargar la promoción." });
    }
  });

  app.patch("/api/stores/:storeId/promotions/:promotionId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const promotionId = parsePositiveIntParam(req.params.promotionId);
      if (!storeId || !promotionId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStorePromotionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      if (parsed.data.items != null) {
        await assertStorePromotionItems(storeId, parsed.data.items);
      }
      const promotion = await appliaStorage.updateStorePromotion(storeId, promotionId, parsed.data);
      const products = await appliaStorage.listStoreProducts(storeId);
      return res.json({ promotion: serializeStorePromotion(promotion, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PROMOTION_NOT_FOUND") return res.status(404).json({ message: "Promoción no encontrada." });
      if (msg === "STORE_PRODUCT_INVALID") {
        return res.status(400).json({ message: "Uno o más productos no pertenecen a esta tienda." });
      }
      console.error("[stores] update promotion", e);
      return res.status(500).json({ message: "No se pudo actualizar la promoción." });
    }
  });

  app.delete("/api/stores/:storeId/promotions/:promotionId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const promotionId = parsePositiveIntParam(req.params.promotionId);
      if (!storeId || !promotionId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      await appliaStorage.deleteStorePromotion(storeId, promotionId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PROMOTION_NOT_FOUND") return res.status(404).json({ message: "Promoción no encontrada." });
      console.error("[stores] delete promotion", e);
      return res.status(500).json({ message: "No se pudo eliminar la promoción." });
    }
  });

  app.get("/api/stores/:storeId/payment-methods", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const methods = await appliaStorage.listStorePaymentMethods(storeId);
      return res.json({ paymentMethods: methods.map(serializeStorePaymentMethod) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] list payment methods", e);
      return res.status(500).json({ message: "No se pudieron cargar los métodos de pago." });
    }
  });

  app.post("/api/stores/:storeId/payment-methods", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = insertStorePaymentMethodSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const method = await appliaStorage.createStorePaymentMethod(storeId, parsed.data);
      return res.status(201).json({ paymentMethod: serializeStorePaymentMethod(method) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] create payment method", e);
      return res.status(500).json({ message: "No se pudo crear el método de pago." });
    }
  });

  app.patch("/api/stores/:storeId/payment-methods/:paymentMethodId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const paymentMethodId = parsePositiveIntParam(req.params.paymentMethodId);
      if (!storeId || !paymentMethodId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStorePaymentMethodSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const method = await appliaStorage.updateStorePaymentMethod(storeId, paymentMethodId, parsed.data);
      return res.json({ paymentMethod: serializeStorePaymentMethod(method) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PAYMENT_METHOD_NOT_FOUND") {
        return res.status(404).json({ message: "Método de pago no encontrado." });
      }
      console.error("[stores] update payment method", e);
      return res.status(500).json({ message: "No se pudo actualizar el método de pago." });
    }
  });

  app.delete("/api/stores/:storeId/payment-methods/:paymentMethodId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const paymentMethodId = parsePositiveIntParam(req.params.paymentMethodId);
      if (!storeId || !paymentMethodId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      await appliaStorage.deleteStorePaymentMethod(storeId, paymentMethodId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PAYMENT_METHOD_NOT_FOUND") {
        return res.status(404).json({ message: "Método de pago no encontrado." });
      }
      console.error("[stores] delete payment method", e);
      return res.status(500).json({ message: "No se pudo eliminar el método de pago." });
    }
  });

  app.get("/api/stores/:storeId/cart", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      let cart = await appliaStorage.getStoreCart(userId, storeId);
      if (cart) cart = await pruneAndSaveCart(userId, cart);
      const payload = await enrichStoreCart(cart, storeId);
      return res.json({ cart: payload });
    } catch (e: unknown) {
      console.error("[stores] get cart", e);
      return res.status(500).json({ message: "No se pudo cargar el carrito." });
    }
  });

  app.post("/api/stores/:storeId/cart/items", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const parsed = addStoreCartItemSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const incoming = addBodyToCartItem(parsed.data);
      await validateCartItemForStore(storeId, incoming);

      const existing = (await appliaStorage.getStoreCart(userId, storeId))?.items ?? [];
      const nextItems = mergeAddCartItem(existing, incoming);
      const saved = await appliaStorage.saveStoreCart(userId, storeId, nextItems);
      const payload = await enrichStoreCart(saved, storeId);
      return res.status(201).json({ cart: payload });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_CART_ITEM_INVALID") {
        return res.status(400).json({ message: "El artículo no está disponible en esta tienda." });
      }
      console.error("[stores] add cart item", e);
      return res.status(500).json({ message: "No se pudo añadir al carrito." });
    }
  });

  app.patch("/api/stores/:storeId/cart/items", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const parsed = updateStoreCartItemSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const existing = (await appliaStorage.getStoreCart(userId, storeId))?.items ?? [];
      const nextItems = setCartItemQuantity(existing, parsed.data);
      if (parsed.data.quantity > 0) {
        const probe =
          parsed.data.kind === "product"
            ? { kind: "product" as const, productId: parsed.data.productId!, quantity: parsed.data.quantity }
            : { kind: "promotion" as const, promotionId: parsed.data.promotionId!, quantity: parsed.data.quantity };
        await validateCartItemForStore(storeId, probe);
      }
      const saved = await appliaStorage.saveStoreCart(userId, storeId, nextItems);
      const payload = await enrichStoreCart(saved, storeId);
      return res.json({ cart: payload });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_CART_ITEM_INVALID") {
        return res.status(400).json({ message: "El artículo no está disponible en esta tienda." });
      }
      console.error("[stores] update cart item", e);
      return res.status(500).json({ message: "No se pudo actualizar el carrito." });
    }
  });

  app.delete("/api/stores/:storeId/cart/items", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const parsed = removeStoreCartItemSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const existing = (await appliaStorage.getStoreCart(userId, storeId))?.items ?? [];
      const nextItems = removeCartItem(existing, parsed.data);
      const saved = await appliaStorage.saveStoreCart(userId, storeId, nextItems);
      const payload = await enrichStoreCart(saved, storeId);
      return res.json({ cart: payload });
    } catch (e: unknown) {
      console.error("[stores] remove cart item", e);
      return res.status(500).json({ message: "No se pudo quitar del carrito." });
    }
  });

  app.patch("/api/stores/:storeId/cart/fulfillment", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const parsed = updateStoreCartFulfillmentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      await validateCartFulfillmentForStore(storeId, parsed.data.fulfillmentMode);
      const existing = await appliaStorage.getStoreCart(userId, storeId);
      const saved = await appliaStorage.saveStoreCart(
        userId,
        storeId,
        existing?.items ?? [],
        parsed.data.fulfillmentMode,
      );
      const payload = await enrichStoreCart(saved, storeId);
      return res.json({ cart: payload });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_CART_FULFILLMENT_INVALID") {
        return res.status(400).json({ message: "Esa modalidad no está disponible en esta tienda." });
      }
      console.error("[stores] update cart fulfillment", e);
      return res.status(500).json({ message: "No se pudo actualizar la modalidad del pedido." });
    }
  });

  app.post("/api/stores/:storeId/cart/checkout", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const parsed = submitStoreCheckoutSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      let cart = await appliaStorage.getStoreCart(userId, storeId);
      if (!cart) return res.status(400).json({ message: "El carrito está vacío." });
      cart = await pruneAndSaveCart(userId, cart);
      const enriched = await enrichStoreCart(cart, storeId);
      if (enriched.items.length === 0) {
        return res.status(400).json({ message: "El carrito está vacío." });
      }

      await validateCheckoutPaymentMethod(storeId, parsed.data.paymentMethodId);
      const fulfillmentMode = await validateCheckoutFulfillment(storeId, parsed.data.fulfillmentMode);
      const paymentMethod = await appliaStorage.getStorePaymentMethod(storeId, parsed.data.paymentMethodId);
      if (!paymentMethod) {
        return res.status(400).json({ message: "Método de pago no válido." });
      }

      const orderItems = enriched.items.map((line) => ({
        kind: line.kind,
        productId: line.productId,
        promotionId: line.promotionId,
        name: line.name,
        price: line.price,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        imageUrl: line.imageUrl,
      }));

      let deliveryFee = 0;
      let deliveryDistanceM: number | null = null;
      const deliveryLocation =
        fulfillmentMode === "delivery" ? (parsed.data.deliveryLocation ?? null) : null;

      if (fulfillmentMode === "delivery") {
        const storeLocation = normalizeStoreLocation(store.location);
        if (!storeLocation) {
          return res.status(400).json({
            message: "La tienda no tiene ubicación configurada para delivery.",
          });
        }
        if (!deliveryLocation) {
          return res.status(400).json({ message: "Selecciona la ubicación de entrega." });
        }
        const quote = await computeStoreDeliveryQuote(
          storeLocation,
          deliveryLocation,
          store.deliveryFares,
        );
        deliveryFee = quote.deliveryFee;
        deliveryDistanceM = quote.distanceM;
      }

      const amountDue =
        fulfillmentMode === "delivery" ? enriched.subtotal + deliveryFee : enriched.subtotal;

      const order = await appliaStorage.createStoreOrder({
        storeId,
        userId,
        paymentMethodId: parsed.data.paymentMethodId,
        paymentMethodName: paymentMethod.name,
        paymentMethodAccountNumber:
          formatStorePaymentMethodExtraFieldsAsText(paymentMethod.extraFields ?? []) ||
          paymentMethod.accountNumber ||
          "",
        fulfillmentMode,
        reference: parsed.data.reference.trim(),
        proofImageUrl: parsed.data.proofImageUrl.trim(),
        amountDue,
        amountPaid: parsed.data.amountPaid,
        deliveryFee,
        deliveryDistanceM,
        deliveryLocation,
        items: orderItems,
        subtotal: enriched.subtotal,
        packRideId: null,
        deliveryUnreadCount: 0,
      });

      await appliaStorage.deleteStoreCart(userId, storeId);

      void notifyStoreOwnerNewOrder(order, store).catch((err) =>
        console.error("[stores] notify owner new order", err),
      );

      return res.status(201).json({
        order: {
          id: order.id,
          storeId: order.storeId,
          status: order.status,
          statusLabel: STORE_ORDER_STATUS_LABELS[order.status],
          subtotal: order.subtotal,
          amountDue: order.amountDue,
          amountPaid: order.amountPaid,
          createdAt: serializeDate(order.createdAt),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_PAYMENT_METHOD_NOT_FOUND") {
        return res.status(400).json({ message: "Método de pago no válido." });
      }
      if (msg === "STORE_CART_FULFILLMENT_INVALID") {
        return res.status(400).json({ message: "Selecciona cómo recibirás tu pedido." });
      }
      console.error("[stores] cart checkout", e);
      return res.status(500).json({ message: "No se pudo registrar la compra." });
    }
  });

  app.get("/api/stores/:storeId/orders", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);

      const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const orderIdRaw = typeof req.query.orderId === "string" ? req.query.orderId.trim() : "";
      const dateFromRaw = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
      const dateToRaw = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
      const deliveryQueue =
        req.query.deliveryQueue === "1" || req.query.deliveryQueue === "true";
      const orderId = orderIdRaw ? Number.parseInt(orderIdRaw, 10) : undefined;
      const statusParsed = statusRaw ? storeOrderStatusSchema.safeParse(statusRaw) : null;

      const orders = await appliaStorage.listStoreOrders(storeId, {
        status: statusParsed?.success ? statusParsed.data : undefined,
        orderId: Number.isFinite(orderId) ? orderId : undefined,
        dateFrom: parseStoreOrderDateFilter(dateFromRaw),
        dateTo: parseStoreOrderDateFilter(dateToRaw),
        deliveryQueue: deliveryQueue || undefined,
      });

      const store = await appliaStorage.getStoreById(storeId);
      const serialized = await Promise.all(orders.map((o) => serializeStoreOrder(o, false, store)));
      return res.json({ orders: serialized });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_OWNER") {
        return res.status(403).json({ message: "No tienes permiso para ver las órdenes." });
      }
      console.error("[stores] list orders", e);
      return res.status(500).json({ message: "No se pudieron cargar las órdenes." });
    }
  });

  app.get("/api/stores/:storeId/orders/delivery-notifications", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const summary = await getStoreDeliveryNotificationsSummary(storeId);
      return res.json(summary);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_OWNER") {
        return res.status(403).json({ message: "No tienes permiso." });
      }
      console.error("[stores] delivery notifications summary", e);
      return res.status(500).json({ message: "No se pudo cargar el resumen." });
    }
  });

  app.get("/api/stores/:storeId/orders/:orderId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);

      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });

      const store = await appliaStorage.getStoreById(storeId);
      return res.json({ order: await serializeStoreOrder(order, true, store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_OWNER") {
        return res.status(403).json({ message: "No tienes permiso para ver esta orden." });
      }
      console.error("[stores] get order", e);
      return res.status(500).json({ message: "No se pudo cargar la orden." });
    }
  });

  app.get("/api/stores/:storeId/orders/:orderId/invoice.pdf", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);

      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      if (!canGenerateStoreOrderInvoice(order.status)) {
        return res.status(400).json({
          message: "La factura solo está disponible cuando la orden está confirmada o en un estado posterior.",
        });
      }

      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const user = (await appliaStorage.getUserById(order.userId)) as
        | { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string }
        | undefined;
      const customerName = user
        ? [user.name ?? user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Cliente"
        : "Cliente";

      const { generateStoreOrderInvoicePdf } = await import("./store-order-invoice");
      const pdf = await generateStoreOrderInvoicePdf({
        order,
        store,
        customer: {
          name: customerName,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
        },
      });

      const fileName = `factura-orden-${order.id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Content-Length", String(pdf.length));
      return res.send(pdf);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_OWNER") {
        return res.status(403).json({ message: "No tienes permiso para ver esta factura." });
      }
      console.error("[stores] order invoice pdf", e);
      return res.status(500).json({ message: "No se pudo generar la factura." });
    }
  });

  app.patch("/api/stores/:storeId/orders/:orderId/status", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);

      const parsed = updateStoreOrderStatusSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const existing = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!existing) return res.status(404).json({ message: "Orden no encontrada." });

      if (!canTransitionStoreOrderStatus(existing, parsed.data.status)) {
        return res.status(400).json({ message: "No puedes cambiar a ese estado desde el estado actual." });
      }

      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      if (parsed.data.status === "listo_para_envio") {
        const order = await handleStoreOrderStatusListoParaEnvio(storeId, orderId, store);
        void notifyCustomerStoreOrderStatusChanged(order, store).catch((err) =>
          console.error("[stores] notify customer order status", err),
        );
        return res.json({ order: await serializeStoreOrder(order, true, store) });
      }

      if (parsed.data.status === "confirmado" && existing.status === "listo_para_envio") {
        const order = await handleStoreOrderRevertFromListoParaEnvio(storeId, orderId);
        void notifyCustomerStoreOrderStatusChanged(order, store).catch((err) =>
          console.error("[stores] notify customer order status", err),
        );
        return res.json({ order: await serializeStoreOrder(order, true, store) });
      }

      const order = await appliaStorage.updateStoreOrderStatus(storeId, orderId, parsed.data.status);
      void notifyCustomerStoreOrderStatusChanged(order, store).catch((err) =>
        console.error("[stores] notify customer order status", err),
      );
      return res.json({ order: await serializeStoreOrder(order, true, store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_OWNER") {
        return res.status(403).json({ message: "No tienes permiso para actualizar esta orden." });
      }
      if (msg === "STORE_ORDER_NOT_FOUND") {
        return res.status(404).json({ message: "Orden no encontrada." });
      }
      if (msg === "STORE_LOCATION_REQUIRED") {
        return res.status(400).json({
          message: "Configura la ubicación de la tienda antes de marcar listo para envío.",
        });
      }
      if (msg === "STORE_ORDER_DELIVERY_LOCATION_REQUIRED") {
        return res.status(400).json({ message: "La orden no tiene ubicación de entrega." });
      }
      if (msg === "STORE_ORDER_NOT_DELIVERY") {
        return res.status(400).json({ message: "Esta orden no es delivery." });
      }
      if (msg === "STORE_ORDER_DELIVERY_SEARCH_ALREADY_ACTIVE") {
        return res.status(409).json({ message: "Ya hay una búsqueda de conductor activa." });
      }
      if (msg === "STORE_ORDER_INVALID_STATUS_FOR_REVERT") {
        return res.status(400).json({ message: "Solo puedes revertir desde Listo para envío." });
      }
      console.error("[stores] update order status", e);
      return res.status(500).json({ message: "No se pudo actualizar el estado." });
    }
  });

  app.post(
    "/api/stores/:storeId/orders/:orderId/delivery-notifications/read",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const userId = String(req.user?.id ?? "");
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const storeId = parsePositiveIntParam(req.params.storeId);
        const orderId = parsePositiveIntParam(req.params.orderId);
        if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
        await requireStoreOwner(userId, storeId);
        const order = await appliaStorage.resetStoreOrderDeliveryUnread(storeId, orderId);
        const store = await appliaStorage.getStoreById(storeId);
        return res.json({ order: await serializeStoreOrder(order, false, store) });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "STORE_NOT_OWNER") {
          return res.status(403).json({ message: "No tienes permiso." });
        }
        if (msg === "STORE_ORDER_NOT_FOUND") {
          return res.status(404).json({ message: "Orden no encontrada." });
        }
        console.error("[stores] mark delivery notifications read", e);
        return res.status(500).json({ message: "No se pudo marcar como leído." });
      }
    },
  );

  app.get("/api/stores/:storeId/orders/:orderId/delivery", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);

      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      if (order.fulfillmentMode !== "delivery") {
        return res.status(400).json({ message: "Esta orden no es delivery." });
      }

      await appliaStorage.resetStoreOrderDeliveryUnread(storeId, orderId);

      const store = await appliaStorage.getStoreById(storeId);
      const packRide = order.packRideId ? await getPackRideDeliveryDetail(order.packRideId) : null;

      return res.json({
        order: await serializeStoreOrder(order, true, store),
        packRide,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_OWNER") {
        return res.status(403).json({ message: "No tienes permiso." });
      }
      console.error("[stores] order delivery detail", e);
      return res.status(500).json({ message: "No se pudo cargar el delivery." });
    }
  });

  /** Órdenes del cliente autenticado (todas las tiendas). */
  app.get("/api/me/store-orders", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const orderIdRaw = typeof req.query.orderId === "string" ? req.query.orderId.trim() : "";
      const storeIdRaw = typeof req.query.storeId === "string" ? req.query.storeId.trim() : "";
      const dateFromRaw = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
      const dateToRaw = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
      const orderId = orderIdRaw ? Number.parseInt(orderIdRaw, 10) : undefined;
      const storeId = storeIdRaw ? Number.parseInt(storeIdRaw, 10) : undefined;
      const statusParsed = statusRaw ? storeOrderStatusSchema.safeParse(statusRaw) : null;

      const orders = await appliaStorage.listStoreOrdersForUser(userId, {
        status: statusParsed?.success ? statusParsed.data : undefined,
        orderId: Number.isFinite(orderId) ? orderId : undefined,
        storeId: Number.isFinite(storeId) ? storeId : undefined,
        dateFrom: parseStoreOrderDateFilter(dateFromRaw),
        dateTo: parseStoreOrderDateFilter(dateToRaw),
      });

      const serialized = await Promise.all(orders.map((o) => serializeStoreOrder(o, false)));
      return res.json({ orders: serialized });
    } catch (e) {
      console.error("[stores] list my orders", e);
      return res.status(500).json({ message: "No se pudieron cargar tus pedidos." });
    }
  });

  app.get("/api/me/store-orders/:orderId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!orderId) return res.status(400).json({ message: "ID inválido." });

      const order = await appliaStorage.getStoreOrderForUser(userId, orderId);
      if (!order) return res.status(404).json({ message: "Pedido no encontrado." });

      const store = await appliaStorage.getStoreById(order.storeId);
      return res.json({ order: await serializeStoreOrder(order, false, store) });
    } catch (e) {
      console.error("[stores] get my order", e);
      return res.status(500).json({ message: "No se pudo cargar el pedido." });
    }
  });

  app.get("/api/stores/:storeId/products", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      const products = await appliaStorage.listStoreProducts(storeId);
      const currency = normalizeStoreCurrencyFields(store);
      return res.json({
        products: products.map((p) =>
          serializeStoreProduct(p, {
            visualCurrencyId: currency.currencyVisualId,
            currencyExtras: currency.currencyExtras,
          }),
        ),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] list products", e);
      return res.status(500).json({ message: "No se pudieron cargar los productos." });
    }
  });

  app.post("/api/stores/:storeId/products", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      const parsed = insertStoreProductSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const priceError = assertProductPricesForAcceptedCurrencies(store, parsed.data.pricesByCurrency);
      if (priceError) return res.status(400).json({ message: priceError });
      await assertStoreCategoryIds(storeId, parsed.data.categoryIds ?? []);
      const product = await appliaStorage.createStoreProduct(storeId, parsed.data);
      const currency = normalizeStoreCurrencyFields(store);
      return res.status(201).json({
        product: serializeStoreProduct(product, {
          visualCurrencyId: currency.currencyVisualId,
          currencyExtras: currency.currencyExtras,
        }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_CATEGORY_INVALID") {
        return res.status(400).json({ message: "Una o más categorías no son válidas para esta tienda." });
      }
      console.error("[stores] create product", e);
      return res.status(500).json({ message: "No se pudo crear el producto." });
    }
  });

  app.get("/api/stores/:storeId/products/:productId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const productId = parsePositiveIntParam(req.params.productId);
      if (!storeId || !productId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      const product = await appliaStorage.getStoreProduct(storeId, productId);
      if (!product) return res.status(404).json({ message: "Producto no encontrado." });
      const currency = normalizeStoreCurrencyFields(store);
      return res.json({
        product: serializeStoreProduct(product, {
          visualCurrencyId: currency.currencyVisualId,
          currencyExtras: currency.currencyExtras,
        }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] get product", e);
      return res.status(500).json({ message: "No se pudo cargar el producto." });
    }
  });

  app.patch("/api/stores/:storeId/products/:productId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const productId = parsePositiveIntParam(req.params.productId);
      if (!storeId || !productId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      const parsed = updateStoreProductSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      if (parsed.data.pricesByCurrency !== undefined || parsed.data.price !== undefined) {
        const existing = await appliaStorage.getStoreProduct(storeId, productId);
        if (!existing) return res.status(404).json({ message: "Producto no encontrado." });
        const mergedPrices = {
          ...(existing.pricesByCurrency ?? {}),
          ...(parsed.data.pricesByCurrency ?? {}),
        };
        if (parsed.data.price !== undefined && parsed.data.pricesByCurrency === undefined) {
          const currency = normalizeStoreCurrencyFields(store);
          mergedPrices[currency.currencyVisualId] = parsed.data.price;
        }
        const priceError = assertProductPricesForAcceptedCurrencies(store, mergedPrices);
        if (priceError) return res.status(400).json({ message: priceError });
      }
      if (parsed.data.categoryIds != null) {
        await assertStoreCategoryIds(storeId, parsed.data.categoryIds);
      }
      const product = await appliaStorage.updateStoreProduct(storeId, productId, parsed.data);
      const currency = normalizeStoreCurrencyFields(store);
      return res.json({
        product: serializeStoreProduct(product, {
          visualCurrencyId: currency.currencyVisualId,
          currencyExtras: currency.currencyExtras,
        }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PRODUCT_NOT_FOUND") return res.status(404).json({ message: "Producto no encontrado." });
      if (msg === "STORE_CATEGORY_INVALID") {
        return res.status(400).json({ message: "Una o más categorías no son válidas para esta tienda." });
      }
      console.error("[stores] update product", e);
      return res.status(500).json({ message: "No se pudo actualizar el producto." });
    }
  });

  app.delete("/api/stores/:storeId/products/:productId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const productId = parsePositiveIntParam(req.params.productId);
      if (!storeId || !productId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      await appliaStorage.deleteStoreProduct(storeId, productId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      if (msg === "STORE_PRODUCT_NOT_FOUND") return res.status(404).json({ message: "Producto no encontrado." });
      console.error("[stores] delete product", e);
      return res.status(500).json({ message: "No se pudo eliminar el producto." });
    }
  });

  app.get("/api/stores/:slug/showcase-products", optionalAuthenticateJWT, async (req: any, res) => {
    try {
      const slug = String(req.params.slug ?? "").trim();
      if (!slug) return res.status(400).json({ message: "Slug inválido." });

      const store = await appliaStorage.getStoreBySlug(slug);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const viewerId = req.user?.id != null ? String(req.user.id) : null;
      const isOwner = await viewerCanManageStore(viewerId, store, req.user?.role);
      const storeForView =
        isOwner ? await repairStoreSubscriptionVisibilityIfNeeded(store) : store;
      const visibilityActive = isStoreVisibilityActive(storeForView);

      // Vitrina pública: clientes e invitados siempre ven productos (tienda única).
      const all = await appliaStorage.listStoreProducts(storeForView.id);
      const showcaseList = all.filter((p) => p.showOnShowcase !== false);
      const ingredientsPage = await appliaStorage.listIngredientsMaterials({ page: 1, limit: 500 });
      const ingredientNameById = new Map(ingredientsPage.items.map((i) => [i.id, i.name]));
      const products = showcaseList.map((p) =>
        serializeStoreShowcaseProduct(p, storeForView, ingredientNameById),
      );

      const allCategories = await appliaStorage.listStoreCategories(storeForView.id);
      const categories = allCategories
        .filter((c) => productIdsForCategory(showcaseList, c.id).length > 0)
        .map(serializeShowcaseCategory);

      const allPromotions = await appliaStorage.listStorePromotions(storeForView.id);
      const promotions = allPromotions
        .filter((p) => p.status === "active" && p.items.some((item) => item.status === "active"))
        .map((p) => serializeStoreShowcasePromotion(p, all));

      return res.json({
        products,
        categories,
        promotions,
        visibilityActive,
        isOwner,
      });
    } catch (e) {
      console.error("[stores] showcase-products", e);
      return res.status(500).json({ message: "No se pudieron cargar los productos de la vitrina." });
    }
  });

  app.get("/api/stores/:slug", optionalAuthenticateJWT, async (req: any, res) => {
    try {
      const slug = String(req.params.slug ?? "").trim();
      if (!slug) return res.status(400).json({ message: "Slug inválido." });
      if (slug === "mine") {
        return res.status(404).json({ message: "Usa GET /api/stores/mine con autenticación." });
      }
      if (slug === "primary" || slug === "subscription-quote") {
        return res.status(404).json({ message: "Ruta no válida." });
      }

      const store = await appliaStorage.getStoreBySlug(slug);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const viewerId = req.user?.id != null ? String(req.user.id) : null;
      const isOwner = await viewerCanManageStore(viewerId, store, req.user?.role);
      const storeForView =
        isOwner ? await repairStoreSubscriptionVisibilityIfNeeded(store) : store;
      const visibilityActive = isStoreVisibilityActive(storeForView);
      const hasPending = isOwner ? await storeHasPendingSubscriptionPayment(storeForView.id) : false;

      // Público siempre puede abrir la vitrina (sin marcar inactive).
      return res.json({
        store: serializeStore(storeForView, {
          hasPendingSubscriptionPayment: hasPending,
          isOwner,
        }),
        isOwner,
        visibilityActive,
      });
    } catch (e) {
      console.error("[stores] by slug", e);
      return res.status(500).json({ message: "No se pudo cargar la tienda." });
    }
  });

  app.get("/api/ingredients-materials", async (req, res) => {
    try {
      const parsed = ingredientsListQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Parámetros inválidos.", errors: parsed.error.errors });
      }
      const result = await appliaStorage.listIngredientsMaterials({
        q: parsed.data.q,
        page: parsed.data.page,
        limit: INGREDIENTS_MATERIALS_PAGE_SIZE,
      });
      return res.json({
        items: result.items.map((item) => ({
          id: item.id,
          name: item.name,
          normalizedName: item.normalizedName,
          createdAt: serializeDate(item.createdAt),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (e) {
      console.error("[ingredients-materials] list", e);
      return res.status(500).json({ message: "No se pudo listar ingredientes y materiales." });
    }
  });

  app.post("/api/ingredients-materials", authenticateJWT, async (req: any, res) => {
    try {
      const parsed = insertIngredientMaterialSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const item = await appliaStorage.createIngredientMaterial(parsed.data);
      return res.status(201).json({
        item: {
          id: item.id,
          name: item.name,
          normalizedName: item.normalizedName,
          createdAt: serializeDate(item.createdAt),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "INGREDIENT_MATERIAL_ALREADY_EXISTS") {
        return res.status(409).json({ message: "Ya existe un ingrediente o material con ese nombre." });
      }
      console.error("[ingredients-materials] create", e);
      return res.status(500).json({ message: "No se pudo crear el ingrediente o material." });
    }
  });
}
