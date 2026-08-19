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
 * # Listar ingredientes/materiales (paginado)
 * curl -s "http://localhost:5000/api/ingredients-materials?page=1&limit=20"
 *
 * # Buscar ingredientes/materiales (filtro + paginación)
 * curl -s "http://localhost:5000/api/ingredients-materials/search?q=harina&page=1&limit=20"
 *
 * # Crear ingrediente/material global
 * curl -s -X POST http://localhost:5000/api/ingredients-materials \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Harina de trigo"}'
 *
 * # Editar ingrediente/material
 * curl -s -X PUT http://localhost:5000/api/ingredients-materials/1 \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Harina integral"}'
 *
 * # Eliminar ingrediente/material
 * curl -s -X DELETE http://localhost:5000/api/ingredients-materials/1 \
 *   -H "Authorization: Bearer TOKEN"
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
  resolveAdditionalDisplayPrice,
  canEnableStoreFulfillmentOptions,
  STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE,
  STORE_PRIMARY_BRANCH_ID,
  defaultStoreBranchName,
  normalizeStoreLocation,
  normalizeStoreBranches,
  storeHasConfiguredLocation,
  findNearestStoreBranch,
  resolveStoreBranch,
  storeBranchesWithLocation,
  normalizeStoreCurrencyFields,
  normalizeStoreDeliveryFares,
  normalizeStoreProductSizes,
  PRIMARY_STORE_ID,
  type StoreProductSize,
  type StoreProductIngredientAdditional,
} from "@shared/store-schema";
import {
  insertStoreShowcaseAdItemSchema,
  type StoreShowcaseAdItem,
  type StoreShowcaseAdKind,
} from "@shared/store-showcase-ads-schema";
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
import { parsePositiveIntParam, requireStoreAccess, requireStoreOwner, requireStoreStaffManagement, resolveStoreAccess, viewerCanManageStore, type StoreAccessContext } from "./store-product-auth";
import { buildStoreStaffDirectory } from "./store-staff-directory";
import {
  appendStoreBranchTransferSystemMessage,
  broadcastStoreBranchChatActivity,
  broadcastStoreOrderCustomerChatActivity,
  buildStoreChatList,
  canAccessStoreBranchChat,
  canAccessStoreConversation,
  canAccessStoreOrderCustomerChat,
  ensureAllStoreBranchPairConversations,
  ensureStoreBranchCoordinationConversation,
  ensureStoreOrderCustomerConversation,
  syncStoreOrderCustomerChatLock,
} from "./store-order-chat";
import { storeChatSendMessageSchema, storeStartCustomerChatSchema, STORE_BRANCH_PAIR_CHAT_KIND, STORE_ORDER_CUSTOMER_CHAT_KIND } from "@shared/store-chat-schema";
import {
  buildStoreWhatsappUrl,
  formatStoreWhatsappDisplay,
  normalizeStoreWhatsappPhone,
} from "@shared/store-whatsapp";
import { isCasheaPaymentMethod } from "@shared/store-cashea";
import { syncStoreCasheaPaymentMethod } from "./store-cashea";
import {
  storeStaffListQuerySchema,
  updateStoreStaffMemberSchema,
} from "@shared/store-staff-schema";
import type { StoreOrderListFilters } from "@shared/store-order-schema";
import { hasAdminPrivileges } from "@shared/roles";
import {
  addStoreCartItemSchema,
  updateStoreCartItemSchema,
  removeStoreCartItemSchema,
  updateStoreCartFulfillmentSchema,
} from "@shared/store-cart-schema";
import { submitStoreCheckoutSchema, updateStoreOrderStatusSchema, updateStoreOrderBranchSchema, canTransitionStoreOrderStatus, STORE_ORDER_STATUS_LABELS, fulfillmentLabel, getAllowedStoreOrderStatuses, getStoreOrderStatusTransitionLabel, storeOrderStatusSchema, parseStoreOrderDateFilter, canGenerateStoreOrderInvoice, type StoreOrder } from "@shared/store-order-schema";
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

import { buildStoreStats } from "./store-stats";

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
  const sizes = product.sizes ?? [];
  const description = product.description?.trim() || null;
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description,
    price: displayPrice,
    pricesByCurrency: product.pricesByCurrency ?? {},
    sizes: sizes.map((s) => ({
      id: s.id,
      name: s.name,
      pricesByCurrency: s.pricesByCurrency ?? {},
      price: resolveProductDisplayPrice(
        { price: 0, pricesByCurrency: s.pricesByCurrency },
        visualCurrencyId,
      ),
      weight: s.weight ?? 0,
    })),
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
    hasWeight: product.hasWeight === true,
    weight: product.hasWeight === true ? product.weight ?? 0 : 0,
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
    hideFromShowcaseAll: category.hideFromShowcaseAll === true,
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
  const sizes = product.sizes ?? [];
  const description = product.description?.trim() || null;
  const resolveName = (id: number) => ingredientNameById.get(id) ?? `Item #${id}`;
  return {
    id: product.id,
    name: product.name,
    description,
    price: displayPrice,
    pricesByCurrency: product.pricesByCurrency ?? {},
    sizes: sizes.map((s) => ({
      id: s.id,
      name: s.name,
      pricesByCurrency: s.pricesByCurrency ?? {},
      price: resolveProductDisplayPrice(
        { price: 0, pricesByCurrency: s.pricesByCurrency },
        currency.currencyVisualId,
      ),
    })),
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
      price: resolveAdditionalDisplayPrice(a, currency.currencyVisualId),
      pricesByCurrency: a.pricesByCurrency ?? {},
      pricesBySize: a.pricesBySize ?? {},
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

function assertProductSizesAndAdditionalsPrices(
  store: Store,
  sizes: StoreProductSize[],
  basePricesByCurrency: Record<string, number> | undefined,
  additionals: StoreProductIngredientAdditional[],
): string | null {
  const currency = normalizeStoreCurrencyFields(store);
  const accepted = currency.currencyAcceptedPaymentIds;

  if (sizes.length > 0) {
    if (sizes.length < 2) {
      return "Indica al menos 2 tamaños o desactiva «varios tamaños».";
    }
    for (const size of sizes) {
      const err = assertProductPricesForAcceptedCurrencies(store, size.pricesByCurrency);
      if (err) return `Tamaño «${size.name}»: ${err}`;
    }
    for (const additional of additionals) {
      for (const size of sizes) {
        const map = additional.pricesBySize?.[size.id] ?? {};
        for (const currencyId of accepted) {
          const value = map[currencyId];
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            const label = currencyLabelForId(currencyId, currency.currencyExtras);
            return `Adicional: falta precio en ${label} para el tamaño «${size.name}».`;
          }
        }
      }
    }
    return null;
  }

  const baseErr = assertProductPricesForAcceptedCurrencies(store, basePricesByCurrency);
  if (baseErr) return baseErr;

  for (const additional of additionals) {
    const map = additional.pricesByCurrency ?? {};
    const hasAnyCurrency = accepted.some((id) => typeof map[id] === "number" && map[id]! > 0);
    if (hasAnyCurrency) {
      for (const currencyId of accepted) {
        const value = map[currencyId];
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          const label = currencyLabelForId(currencyId, currency.currencyExtras);
          return `Adicional: falta el precio en ${label}.`;
        }
      }
    } else if (!(typeof additional.price === "number" && additional.price > 0)) {
      return "Adicional: indica un precio válido.";
    }
  }
  return null;
}

function serializeShowcaseCategory(category: StoreCategory) {
  return {
    id: category.id,
    name: category.name,
    hideFromShowcaseAll: category.hideFromShowcaseAll === true,
  };
}

function serializeShowcaseAdItem(item: StoreShowcaseAdItem) {
  return {
    id: item.id,
    storeId: item.storeId,
    kind: item.kind,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    sortOrder: item.sortOrder,
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
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
    systemKind: method.systemKind ?? null,
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
    | { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string }
    | undefined;
  const store = storeOverride ?? (await appliaStorage.getStoreById(order.storeId));
  const branches = normalizeStoreBranches(store?.branches, store?.location ?? null);
  const assignedBranch =
    resolveStoreBranch(branches, order.branchId) ??
    branches.find((b) => b.id === STORE_PRIMARY_BRANCH_ID) ??
    branches[0] ??
    null;
  const storeLocation =
    normalizeStoreLocation(order.storeLocation) ??
    assignedBranch?.location ??
    normalizeStoreLocation(store?.location ?? null);
  const branchName =
    (order.branchName ?? "").trim() || assignedBranch?.name || defaultStoreBranchName(0);
  const branchId = (order.branchId ?? "").trim() || assignedBranch?.id || STORE_PRIMARY_BRANCH_ID;
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
    customerPhone: user?.phone?.trim() ? user.phone.trim() : null,
    storeLocation,
    paymentMethodId: order.paymentMethodId,
    paymentMethodName: order.paymentMethodName,
    paymentMethodAccountNumber: order.paymentMethodAccountNumber,
    fulfillmentMode: order.fulfillmentMode,
    fulfillmentLabel: fulfillmentLabel(order.fulfillmentMode),
    branchId,
    branchName,
    reference: order.reference,
    proofImageUrl: order.proofImageUrl,
    customerNote: order.customerNote ?? "",
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

function parseStoreOrderListFiltersFromQuery(
  query: Record<string, unknown>,
  access: StoreAccessContext,
): StoreOrderListFilters {
  const statusRaw = typeof query.status === "string" ? query.status.trim() : "";
  const orderIdRaw = typeof query.orderId === "string" ? query.orderId.trim() : "";
  const dateFromRaw = typeof query.dateFrom === "string" ? query.dateFrom.trim() : "";
  const dateToRaw = typeof query.dateTo === "string" ? query.dateTo.trim() : "";
  const branchIdRaw = typeof query.branchId === "string" ? query.branchId.trim() : "";
  const deliveryQueue = query.deliveryQueue === "1" || query.deliveryQueue === "true";
  const orderId = orderIdRaw ? Number.parseInt(orderIdRaw, 10) : undefined;
  const statusParsed = statusRaw ? storeOrderStatusSchema.safeParse(statusRaw) : null;

  let branchId = branchIdRaw || undefined;
  if (access.isEmployee && !access.canFilterOrdersByBranch) {
    branchId = access.employeeBranchId ?? undefined;
  }

  return {
    status: statusParsed?.success ? statusParsed.data : undefined,
    orderId: Number.isFinite(orderId) ? orderId : undefined,
    dateFrom: parseStoreOrderDateFilter(dateFromRaw),
    dateTo: parseStoreOrderDateFilter(dateToRaw),
    deliveryQueue: deliveryQueue || undefined,
    branchId,
  };
}

function assertStoreOrderVisibleToAccess(order: StoreOrder, access: StoreAccessContext): void {
  if (access.canFilterOrdersByBranch) return;
  if (!access.isEmployee || !access.employeeBranchId) {
    throw new Error("STORE_FORBIDDEN");
  }
  const orderBranch = (order.branchId ?? STORE_PRIMARY_BRANCH_ID).trim() || STORE_PRIMARY_BRANCH_ID;
  if (orderBranch !== access.employeeBranchId) {
    throw new Error("STORE_ORDER_FORBIDDEN");
  }
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
    branches: normalizeStoreBranches(store.branches, store.location ?? null),
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
    whatsappPhone: store.whatsappPhone ?? null,
    whatsappDisplay: formatStoreWhatsappDisplay(store.whatsappPhone),
    whatsappUrl: buildStoreWhatsappUrl(store.whatsappPhone),
    casheaEnabled: store.casheaEnabled === true,
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
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(INGREDIENTS_MATERIALS_PAGE_SIZE),
});

const ingredientsSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "El término de búsqueda es obligatorio"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(INGREDIENTS_MATERIALS_PAGE_SIZE),
});

/** Paginación opcional: sin page/limit se devuelve el listado completo (pickers/forms). */
const storeAdminOptionalPaginationSchema = z.object({
  page: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional(),
  ),
  limit: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(100).optional(),
  ),
});

function hasAdminListPaginationQuery(query: unknown): boolean {
  if (!query || typeof query !== "object") return false;
  const q = query as Record<string, unknown>;
  const page = q.page;
  const limit = q.limit;
  return (page != null && page !== "") || (limit != null && limit !== "");
}

function parseOptionalAdminListPagination(
  query: unknown,
): { ok: true; pagination?: { page: number; limit: number } } | { ok: false } {
  const wantsPagination = hasAdminListPaginationQuery(query);
  const parsed = storeAdminOptionalPaginationSchema.safeParse(query ?? {});
  if (!parsed.success) {
    return wantsPagination ? { ok: false } : { ok: true };
  }
  if (parsed.data.page == null && parsed.data.limit == null) {
    return { ok: true };
  }
  return {
    ok: true,
    pagination: {
      page: parsed.data.page ?? 1,
      limit: parsed.data.limit ?? 10,
    },
  };
}

function parseOptionalAdminListNameQuery(query: unknown): string | undefined {
  if (!query || typeof query !== "object") return undefined;
  const raw = (query as Record<string, unknown>).q;
  if (raw == null) return undefined;
  const q = String(raw).trim().toLowerCase();
  return q || undefined;
}

function filterSerializedListByName<T extends { name: string }>(items: T[], q?: string): T[] {
  if (!q) return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

function paginateSerializedList<T>(
  items: T[],
  pagination: { page: number; limit: number },
): {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  const total = items.length;
  const limit = pagination.limit;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
  };
}

function serializeIngredientMaterial(item: {
  id: number;
  name: string;
  normalizedName: string;
  createdAt: Date | string;
}) {
  return {
    id: item.id,
    name: item.name,
    normalizedName: item.normalizedName,
    createdAt: serializeDate(item.createdAt),
  };
}

async function respondIngredientsPage(
  res: import("express").Response,
  options: { q?: string; page: number; limit: number },
) {
  const result = await appliaStorage.listIngredientsMaterials({
    q: options.q,
    page: options.page,
    limit: options.limit,
  });
  return res.json({
    items: result.items.map(serializeIngredientMaterial),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

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

      const store = await appliaStorage.createStore({
        ownerUserId: userId,
        name: parsed.data.name,
      });
      return res.status(201).json({ store: serializeStore(store) });
    } catch (e: unknown) {
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
          store = (await appliaStorage.getStoreById(PRIMARY_STORE_ID)) ?? undefined;
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

  /** Tienda donde el usuario es empleado (para navbar / acceso rápido). */
  app.get("/api/stores/my-staff-store", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const membership = await appliaStorage.findStoreStaffMembershipForUser(userId);
      if (!membership) {
        return res.status(404).json({ message: "No eres empleado de ninguna tienda." });
      }
      const store = await appliaStorage.getStoreById(membership.storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      return res.json({
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
        },
        branchId: membership.branchId,
        isEmployee: true,
      });
    } catch (e) {
      console.error("[stores] my-staff-store", e);
      return res.status(500).json({ message: "No se pudo cargar tu tienda de trabajo." });
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
          store = (await appliaStorage.getStoreById(PRIMARY_STORE_ID)) ?? undefined;
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
      const nextBranches =
        parsed.data.branches !== undefined ? parsed.data.branches : store.branches;
      if (!canEnableStoreFulfillmentOptions(nextFulfillment, nextLocation, nextBranches)) {
        return res.status(400).json({ message: STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE });
      }
      const updated = await appliaStorage.updateStore(store.id, parsed.data);
      if (parsed.data.casheaEnabled !== undefined) {
        await syncStoreCasheaPaymentMethod(appliaStorage, store.id, parsed.data.casheaEnabled);
      }
      const freshStore =
        (await appliaStorage.getStoreById(store.id)) ??
        updated;
      if (parsed.data.branches !== undefined) {
        void ensureAllStoreBranchPairConversations(appliaStorage, freshStore);
      }
      const hasPending = await storeHasPendingSubscriptionPayment(freshStore.id);
      return res.json({
        store: serializeStore(freshStore, { hasPendingSubscriptionPayment: hasPending, isOwner: true }),
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

  /** Tienda principal del sistema: id fijo en PRIMARY_STORE_ID. */
  app.get("/api/stores/primary", async (_req, res) => {
    try {
      const store = await appliaStorage.getStoreById(PRIMARY_STORE_ID);
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
      const nextBranches =
        parsed.data.branches !== undefined ? parsed.data.branches : existing.branches;
      if (!canEnableStoreFulfillmentOptions(nextFulfillment, nextLocation, nextBranches)) {
        return res.status(400).json({ message: STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE });
      }
      const patchBody = { ...parsed.data };
      if (patchBody.whatsappPhone !== undefined) {
        patchBody.whatsappPhone = normalizeStoreWhatsappPhone(patchBody.whatsappPhone);
      }
      const store = await appliaStorage.updateStore(storeId, patchBody);
      if (parsed.data.casheaEnabled !== undefined) {
        await syncStoreCasheaPaymentMethod(appliaStorage, storeId, parsed.data.casheaEnabled);
      }
      const freshStore = (await appliaStorage.getStoreById(storeId)) ?? store;
      if (parsed.data.branches !== undefined) {
        void ensureAllStoreBranchPairConversations(appliaStorage, freshStore);
      }
      return res.json({ store: serializeStore(freshStore, { isOwner: true }) });
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
      const paginationResult = parseOptionalAdminListPagination(req.query);
      if (!paginationResult.ok) {
        return res.status(400).json({ message: "Parámetros de paginación inválidos." });
      }
      const nameQuery = parseOptionalAdminListNameQuery(req.query);
      const [categories, products] = await Promise.all([
        appliaStorage.listStoreCategories(storeId),
        appliaStorage.listStoreProducts(storeId),
      ]);
      const serialized = filterSerializedListByName(
        categories.map((c) => serializeStoreCategory(c, products)),
        nameQuery,
      );
      if (!paginationResult.pagination) {
        return res.json({ categories: serialized });
      }
      const pageResult = paginateSerializedList(serialized, paginationResult.pagination);
      return res.json({
        categories: pageResult.items,
        total: pageResult.total,
        page: pageResult.page,
        limit: pageResult.limit,
        totalPages: pageResult.totalPages,
      });
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
        hideFromShowcaseAll: parsed.data.hideFromShowcaseAll ?? false,
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
        hideFromShowcaseAll: parsed.data.hideFromShowcaseAll,
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
      const paginationResult = parseOptionalAdminListPagination(req.query);
      if (!paginationResult.ok) {
        return res.status(400).json({ message: "Parámetros de paginación inválidos." });
      }
      const nameQuery = parseOptionalAdminListNameQuery(req.query);
      const [promotions, products] = await Promise.all([
        appliaStorage.listStorePromotions(storeId),
        appliaStorage.listStoreProducts(storeId),
      ]);
      const serialized = filterSerializedListByName(
        promotions.map((p) => serializeStorePromotion(p, products)),
        nameQuery,
      );
      if (!paginationResult.pagination) {
        return res.json({ promotions: serialized });
      }
      const pageResult = paginateSerializedList(serialized, paginationResult.pagination);
      return res.json({
        promotions: pageResult.items,
        total: pageResult.total,
        page: pageResult.page,
        limit: pageResult.limit,
        totalPages: pageResult.totalPages,
      });
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
      const existingMethod = await appliaStorage.getStorePaymentMethod(storeId, paymentMethodId);
      if (existingMethod && isCasheaPaymentMethod(existingMethod)) {
        return res.status(400).json({
          message: "Este método se gestiona desde «Activar Cashea» en la configuración de la tienda.",
        });
      }
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
      const existingMethod = await appliaStorage.getStorePaymentMethod(storeId, paymentMethodId);
      if (existingMethod && isCasheaPaymentMethod(existingMethod)) {
        return res.status(400).json({
          message: "Este método se gestiona desde «Activar Cashea» en la configuración de la tienda.",
        });
      }
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
            ? {
                kind: "product" as const,
                productId: parsed.data.productId!,
                quantity: parsed.data.quantity,
                sizeId: parsed.data.sizeId ?? null,
                removedIngredientMaterialIds: parsed.data.removedIngredientMaterialIds ?? [],
                additionalIngredientMaterialIds: parsed.data.additionalIngredientMaterialIds ?? [],
              }
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
      if (isCasheaPaymentMethod(paymentMethod)) {
        return res.status(400).json({
          message:
            "Cashea se gestiona por WhatsApp. Confirma tu pedido desde la vitrina con el método Cashea.",
        });
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

      const branches = normalizeStoreBranches(store.branches, store.location ?? null);
      const locatedBranches = storeBranchesWithLocation(branches);
      if (!storeHasConfiguredLocation(branches, store.location) || locatedBranches.length === 0) {
        return res.status(400).json({
          message: "La tienda no tiene una sucursal con ubicación configurada.",
        });
      }

      let assignedBranch = locatedBranches[0];
      if (fulfillmentMode === "delivery") {
        if (!deliveryLocation) {
          return res.status(400).json({ message: "Selecciona la ubicación de entrega." });
        }
        assignedBranch =
          findNearestStoreBranch(branches, deliveryLocation) ?? assignedBranch;
        const quote = await computeStoreDeliveryQuote(
          assignedBranch.location,
          deliveryLocation,
          store.deliveryFares,
          { itemCount: enriched.itemCount, cartWeightKg: enriched.cartWeightKg },
        );
        deliveryFee = quote.deliveryFee;
        deliveryDistanceM = quote.distanceM;
      } else {
        const requested = resolveStoreBranch(branches, parsed.data.branchId);
        if (!requested?.location) {
          if (locatedBranches.length === 1) {
            assignedBranch = locatedBranches[0];
          } else {
            return res.status(400).json({ message: "Selecciona la sucursal." });
          }
        } else {
          assignedBranch = requested as typeof assignedBranch;
        }
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
        branchId: assignedBranch.id,
        branchName: assignedBranch.name,
        storeLocation: assignedBranch.location,
        reference: parsed.data.reference.trim(),
        proofImageUrl: parsed.data.proofImageUrl.trim(),
        customerNote: parsed.data.customerNote?.trim() ?? "",
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
      const access = await requireStoreAccess(userId, storeId, req.user?.role);

      const orders = await appliaStorage.listStoreOrders(
        storeId,
        parseStoreOrderListFiltersFromQuery(req.query ?? {}, access),
      );

      const store = await appliaStorage.getStoreById(storeId);
      const serialized = await Promise.all(orders.map((o) => serializeStoreOrder(o, false, store)));
      return res.json({
        orders: serialized,
        branchFilterLocked: access.isEmployee && !access.canFilterOrdersByBranch,
        employeeBranchId: access.employeeBranchId,
        canFilterOrdersByBranch: access.canFilterOrdersByBranch,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN") {
        return res.status(403).json({ message: "No tienes permiso para ver las órdenes." });
      }
      console.error("[stores] list orders", e);
      return res.status(500).json({ message: "No se pudieron cargar las órdenes." });
    }
  });

  app.get("/api/stores/:storeId/stats", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });

      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!access.isOwner && !access.isPlatformAdmin) {
        return res.status(403).json({ message: "No tienes permiso para ver estadísticas." });
      }

      const stats = await buildStoreStats({
        storeId,
        access,
        rawQuery: req.query ?? {},
      });

      return res.json({ stats });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso." });
      console.error("[stores] stats", e);
      return res.status(500).json({ message: "No se pudieron cargar las estadísticas." });
    }
  });

  app.get("/api/stores/:storeId/orders/delivery-notifications", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      const branchId =
        access.isEmployee && !access.canFilterOrdersByBranch ? access.employeeBranchId : null;
      const summary = await getStoreDeliveryNotificationsSummary(storeId, branchId);
      return res.json(summary);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN") {
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
      const access = await requireStoreAccess(userId, storeId, req.user?.role);

      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      assertStoreOrderVisibleToAccess(order, access);

      const store = await appliaStorage.getStoreById(storeId);
      return res.json({ order: await serializeStoreOrder(order, true, store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN" || msg === "STORE_ORDER_FORBIDDEN") {
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
      const access = await requireStoreAccess(userId, storeId, req.user?.role);

      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      assertStoreOrderVisibleToAccess(order, access);
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
      if (msg === "STORE_FORBIDDEN" || msg === "STORE_ORDER_FORBIDDEN") {
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
      const access = await requireStoreAccess(userId, storeId, req.user?.role);

      const parsed = updateStoreOrderStatusSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const existing = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!existing) return res.status(404).json({ message: "Orden no encontrada." });
      assertStoreOrderVisibleToAccess(existing, access);

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
      void syncStoreOrderCustomerChatLock(appliaStorage, order).catch((err) =>
        console.error("[stores] sync order customer chat lock", err),
      );
      void notifyCustomerStoreOrderStatusChanged(order, store).catch((err) =>
        console.error("[stores] notify customer order status", err),
      );
      return res.json({ order: await serializeStoreOrder(order, true, store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN" || msg === "STORE_ORDER_FORBIDDEN") {
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
        const access = await requireStoreAccess(userId, storeId, req.user?.role);
        const existing = await appliaStorage.getStoreOrder(storeId, orderId);
        if (!existing) return res.status(404).json({ message: "Orden no encontrada." });
        assertStoreOrderVisibleToAccess(existing, access);
        const order = await appliaStorage.resetStoreOrderDeliveryUnread(storeId, orderId);
        const store = await appliaStorage.getStoreById(storeId);
        return res.json({ order: await serializeStoreOrder(order, false, store) });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "STORE_FORBIDDEN" || msg === "STORE_ORDER_FORBIDDEN") {
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
      const access = await requireStoreAccess(userId, storeId, req.user?.role);

      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      assertStoreOrderVisibleToAccess(order, access);
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
      if (msg === "STORE_FORBIDDEN" || msg === "STORE_ORDER_FORBIDDEN") {
        return res.status(403).json({ message: "No tienes permiso." });
      }
      console.error("[stores] order delivery detail", e);
      return res.status(500).json({ message: "No se pudo cargar el delivery." });
    }
  });

  app.patch("/api/stores/:storeId/orders/:orderId/branch", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);

      const parsed = updateStoreOrderBranchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const existing = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!existing) return res.status(404).json({ message: "Orden no encontrada." });
      assertStoreOrderVisibleToAccess(existing, access);

      const store = await appliaStorage.getStoreById(storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const branches = normalizeStoreBranches(store.branches, store.location ?? null);
      const targetBranch = resolveStoreBranch(branches, parsed.data.branchId);
      if (!targetBranch) {
        return res.status(400).json({ message: "Sucursal no válida." });
      }

      if (access.isEmployee && !access.canFilterOrdersByBranch) {
        if (parsed.data.branchId !== access.employeeBranchId) {
          return res.status(403).json({
            message: "Solo puedes reasignar pedidos a tu sucursal asignada.",
          });
        }
      }

      const fromBranchId = (existing.branchId ?? "").trim();
      const fromBranchName = (existing.branchName ?? "").trim() || resolveStoreBranch(branches, fromBranchId)?.name;

      const order = await appliaStorage.patchStoreOrder(storeId, orderId, {
        branchId: targetBranch.id,
        branchName: targetBranch.name,
        storeLocation: targetBranch.location,
      });

      void appendStoreBranchTransferSystemMessage({
        storage: appliaStorage,
        store,
        orderId,
        actorUserId: userId,
        fromBranchId,
        fromBranchName,
        toBranchId: targetBranch.id,
        toBranchName: targetBranch.name,
      }).catch((err) => console.error("[stores] branch transfer chat message", err));

      const customerConv = await appliaStorage.findStoreOrderCustomerConversation(orderId);
      if (customerConv) {
        await appliaStorage.patchConversation(Number((customerConv as { id: number }).id), {
          branchId: targetBranch.id,
          branchName: targetBranch.name,
        });
      }

      return res.json({ order: await serializeStoreOrder(order, true, store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN" || msg === "STORE_ORDER_FORBIDDEN") {
        return res.status(403).json({ message: "No tienes permiso para reasignar esta orden." });
      }
      if (msg === "STORE_ORDER_NOT_FOUND") {
        return res.status(404).json({ message: "Orden no encontrada." });
      }
      console.error("[stores] patch order branch", e);
      return res.status(500).json({ message: "No se pudo reasignar la sucursal." });
    }
  });

  // ==================== Chat tienda (sucursales + cliente por pedido) ====================

  type StoreChatWhatsappFields = {
    whatsappPhone: string | null;
    whatsappDisplay: string | null;
    whatsappUrl: string | null;
  };

  const EMPTY_STORE_CHAT_WHATSAPP: StoreChatWhatsappFields = {
    whatsappPhone: null,
    whatsappDisplay: null,
    whatsappUrl: null,
  };

  function staffCustomerChatWhatsappFields(
    orderId: number,
    customerPhoneRaw: string | null | undefined,
  ): StoreChatWhatsappFields {
    const normalized = normalizeStoreWhatsappPhone(customerPhoneRaw);
    if (!normalized) return EMPTY_STORE_CHAT_WHATSAPP;
    return {
      whatsappPhone: normalized,
      whatsappDisplay: formatStoreWhatsappDisplay(normalized),
      whatsappUrl: buildStoreWhatsappUrl(normalized, `Hola, escribo sobre el pedido #${orderId}`),
    };
  }

  async function loadStoreChatSession(
    store: StoreAccessContext["store"],
    conversationId: number,
    userId: string,
    access: StoreAccessContext,
  ) {
    const conv = await appliaStorage.getConversationById(conversationId);
    if (!conv) return null;
    const allowed = await canAccessStoreConversation(appliaStorage, userId, store, conv as any, access);
    if (!allowed) return null;
    const { messages, hasMore } = await appliaStorage.getMessagesByConversation(conversationId, { limit: 50 });
    const row = conv as {
      kind?: string;
      storeOrderId?: number;
      branchName?: string | null;
      branchNameA?: string;
      branchNameB?: string;
      messagesLocked?: boolean;
    };
    let customerName: string | null = null;
    let branchName = row.branchName ?? null;
    let whatsappFields: StoreChatWhatsappFields = EMPTY_STORE_CHAT_WHATSAPP;
    if (row.kind === STORE_ORDER_CUSTOMER_CHAT_KIND && row.storeOrderId) {
      const order = await appliaStorage.getStoreOrder(store.id, Number(row.storeOrderId));
      if (order) {
        const customer = (await appliaStorage.getUserById(order.userId)) as
          | { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string }
          | undefined;
        customerName =
          [customer?.name ?? customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() ||
          customer?.email ||
          null;
        branchName = branchName ?? order.branchName ?? null;
        whatsappFields = staffCustomerChatWhatsappFields(order.id, customer?.phone);
      }
    }
    if (row.kind === STORE_BRANCH_PAIR_CHAT_KIND) {
      branchName = [row.branchNameA, row.branchNameB].filter(Boolean).join(" ↔ ") || null;
    }
    return {
      conversationId,
      messages,
      hasMore,
      chatLocked: row.messagesLocked === true,
      chatAvailable: true,
      customerName,
      branchName,
      ...whatsappFields,
    };
  }

  app.get("/api/stores/:storeId/chats", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!canAccessStoreBranchChat(access)) {
        return res.status(403).json({ message: "No tienes permiso para ver los chats." });
      }
      const chats = await buildStoreChatList(appliaStorage, access.store, access, userId);
      return res.json({ chats });
    } catch (e) {
      console.error("[stores] chats list", e);
      return res.status(500).json({ message: "No se pudo cargar la lista de chats." });
    }
  });

  app.get("/api/stores/:storeId/chats/:conversationId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const conversationId = parsePositiveIntParam(req.params.conversationId);
      if (!storeId || !conversationId) return res.status(400).json({ message: "ID inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!canAccessStoreBranchChat(access)) {
        return res.status(403).json({ message: "No tienes permiso para ver este chat." });
      }
      const session = await loadStoreChatSession(access.store, conversationId, userId, access);
      if (!session) return res.status(404).json({ message: "Chat no encontrado." });
      return res.json(session);
    } catch (e) {
      console.error("[stores] chat get", e);
      return res.status(500).json({ message: "No se pudo cargar el chat." });
    }
  });

  app.post("/api/stores/:storeId/chats/:conversationId/messages", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const conversationId = parsePositiveIntParam(req.params.conversationId);
      if (!storeId || !conversationId) return res.status(400).json({ message: "ID inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!canAccessStoreBranchChat(access)) {
        return res.status(403).json({ message: "No tienes permiso para escribir en este chat." });
      }
      const conv = await appliaStorage.getConversationById(conversationId);
      if (!conv) return res.status(404).json({ message: "Chat no encontrado." });
      const allowed = await canAccessStoreConversation(appliaStorage, userId, access.store, conv as any, access);
      if (!allowed) return res.status(403).json({ message: "No tienes permiso para este chat." });
      if ((conv as { messagesLocked?: boolean }).messagesLocked === true) {
        return res.status(403).json({ message: "Este chat está cerrado." });
      }
      const parsed = storeChatSendMessageSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const message = await appliaStorage.createMessage({
        conversationId,
        senderId: userId,
        content: parsed.data.content,
        type: parsed.data.type,
        status: "sent",
      });
      const preview = String(message.content ?? "").slice(0, 120);
      const kind = String((conv as { kind?: string }).kind ?? "");
      const { getIO } = await import("./socket");
      const io = getIO();
      if (io) {
        if (kind === "store_branch_pair") {
          await broadcastStoreBranchChatActivity(io, appliaStorage, storeId, conversationId, preview);
        } else if (kind === "store_order_customer") {
          const orderId = Number((conv as { storeOrderId?: number }).storeOrderId);
          const order = await appliaStorage.getStoreOrder(storeId, orderId);
          if (order) {
            await broadcastStoreOrderCustomerChatActivity(
              io,
              appliaStorage,
              access.store,
              order,
              conversationId,
              preview,
              userId,
            );
          }
        }
      }
      return res.status(201).json({ message, conversationId });
    } catch (e) {
      console.error("[stores] chat send", e);
      return res.status(500).json({ message: "No se pudo enviar el mensaje." });
    }
  });

  app.post("/api/stores/:storeId/chats/customer/start", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!canAccessStoreBranchChat(access)) {
        return res.status(403).json({ message: "No tienes permiso para iniciar chats." });
      }
      const parsed = storeStartCustomerChatSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const order = await appliaStorage.getStoreOrder(storeId, parsed.data.orderId);
      if (!order) return res.status(404).json({ message: "Pedido no encontrado." });

      const branches = normalizeStoreBranches(access.store.branches, access.store.location ?? null);
      let branchIdOverride = parsed.data.branchId?.trim() || null;

      if (access.isEmployee && access.employeeBranchId) {
        branchIdOverride = access.employeeBranchId;
      } else if (
        !branchIdOverride &&
        branches.length > 1 &&
        (access.isOwner || access.isPlatformAdmin)
      ) {
        return res.status(400).json({
          message: "Selecciona la sucursal desde la que quieres escribir al cliente.",
          code: "BRANCH_REQUIRED",
        });
      } else if (!branchIdOverride && branches.length === 1) {
        branchIdOverride = branches[0]?.id ?? order.branchId ?? null;
      } else if (!branchIdOverride) {
        branchIdOverride = (order.branchId ?? "").trim() || null;
      }

      if (branchIdOverride && !resolveStoreBranch(branches, branchIdOverride)) {
        return res.status(400).json({ message: "Sucursal inválida." });
      }

      if (access.isEmployee && access.employeeBranchId && branchIdOverride !== access.employeeBranchId) {
        return res.status(403).json({ message: "Solo puedes escribir desde tu sucursal asignada." });
      }

      const chat = await ensureStoreOrderCustomerConversation(appliaStorage, access.store, order, {
        branchIdOverride,
        allowStaffInitiated: true,
      });
      const session = await loadStoreChatSession(access.store, chat.id, userId, access);
      const chats = await buildStoreChatList(appliaStorage, access.store, access, userId);
      return res.status(chat.created ? 201 : 200).json({
        conversationId: chat.id,
        created: chat.created,
        session,
        chats,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ORDER_CHAT_UNAVAILABLE") {
        return res.status(400).json({ message: "El chat no está disponible para este pedido." });
      }
      console.error("[stores] customer chat start", e);
      return res.status(500).json({ message: "No se pudo iniciar el chat con el cliente." });
    }
  });

  /** @deprecated Usar GET /api/stores/:storeId/chats */
  app.get("/api/stores/:storeId/branch-chat", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!canAccessStoreBranchChat(access)) {
        return res.status(403).json({ message: "No tienes permiso para ver este chat." });
      }
      const store = access.store;
      const { id: conversationId } = await ensureStoreBranchCoordinationConversation(appliaStorage, store);
      const { messages, hasMore } = await appliaStorage.getMessagesByConversation(conversationId, { limit: 50 });
      const conv = await appliaStorage.getConversationById(conversationId);
      return res.json({
        conversationId,
        messages,
        hasMore,
        chatLocked: (conv as { messagesLocked?: boolean } | null)?.messagesLocked === true,
        // En chats entre sucursales no ofrecemos redirección directa a WhatsApp.
        whatsappPhone: null,
        whatsappDisplay: null,
        whatsappUrl: null,
      });
    } catch (e) {
      console.error("[stores] branch chat get", e);
      return res.status(500).json({ message: "No se pudo cargar el chat." });
    }
  });

  app.post("/api/stores/:storeId/branch-chat/messages", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!canAccessStoreBranchChat(access)) {
        return res.status(403).json({ message: "No tienes permiso para escribir en este chat." });
      }
      const parsed = storeChatSendMessageSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const { id: conversationId } = await ensureStoreBranchCoordinationConversation(
        appliaStorage,
        access.store,
      );
      const conv = await appliaStorage.getConversationById(conversationId);
      if ((conv as { messagesLocked?: boolean } | null)?.messagesLocked === true) {
        return res.status(403).json({ message: "Este chat está cerrado." });
      }
      const message = await appliaStorage.createMessage({
        conversationId,
        senderId: userId,
        content: parsed.data.content,
        type: parsed.data.type,
        status: "sent",
      });
      const preview = String(message.content ?? "").slice(0, 120);
      const { getIO } = await import("./socket");
      const io = getIO();
      if (io) {
        await broadcastStoreBranchChatActivity(io, appliaStorage, storeId, conversationId, preview);
      }
      return res.status(201).json({ message, conversationId });
    } catch (e) {
      console.error("[stores] branch chat send", e);
      return res.status(500).json({ message: "No se pudo enviar el mensaje." });
    }
  });

  app.get("/api/stores/:storeId/orders/:orderId/customer-chat", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      const allowed = await canAccessStoreOrderCustomerChat(appliaStorage, userId, access.store, order, access);
      if (!allowed) return res.status(403).json({ message: "No tienes permiso para ver este chat." });
      const chat = await ensureStoreOrderCustomerConversation(appliaStorage, access.store, order, {
        allowStaffInitiated: access.isOwner || access.isPlatformAdmin || access.isEmployee,
      });
      const { messages, hasMore } = await appliaStorage.getMessagesByConversation(chat.id, { limit: 50 });
      const customer = (await appliaStorage.getUserById(order.userId)) as
        | { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string }
        | undefined;
      const whatsappFields = staffCustomerChatWhatsappFields(order.id, customer?.phone);
      return res.json({
        conversationId: chat.id,
        messages,
        hasMore,
        chatLocked: chat.chatLocked,
        chatAvailable: true,
        customerName:
          [customer?.name ?? customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() ||
          customer?.email ||
          null,
        branchName: order.branchName ?? null,
        ...whatsappFields,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ORDER_CHAT_UNAVAILABLE") {
        return res.status(400).json({ message: "El chat no está disponible para este pedido." });
      }
      console.error("[stores] order customer chat get", e);
      return res.status(500).json({ message: "No se pudo cargar el chat." });
    }
  });

  app.post("/api/stores/:storeId/orders/:orderId/customer-chat/messages", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!storeId || !orderId) return res.status(400).json({ message: "ID inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      const order = await appliaStorage.getStoreOrder(storeId, orderId);
      if (!order) return res.status(404).json({ message: "Orden no encontrada." });
      const allowed = await canAccessStoreOrderCustomerChat(appliaStorage, userId, access.store, order, access);
      if (!allowed) return res.status(403).json({ message: "No tienes permiso para escribir en este chat." });
      const parsed = storeChatSendMessageSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const chat = await ensureStoreOrderCustomerConversation(appliaStorage, access.store, order, {
        allowStaffInitiated: access.isOwner || access.isPlatformAdmin || access.isEmployee,
      });
      if (chat.chatLocked) {
        return res.status(403).json({ message: "Este chat está cerrado." });
      }
      const message = await appliaStorage.createMessage({
        conversationId: chat.id,
        senderId: userId,
        content: parsed.data.content,
        type: parsed.data.type,
        status: "sent",
      });
      const preview = String(message.content ?? "").slice(0, 120);
      const { getIO } = await import("./socket");
      const io = getIO();
      if (io) {
        await broadcastStoreOrderCustomerChatActivity(
          io,
          appliaStorage,
          access.store,
          order,
          chat.id,
          preview,
          userId,
        );
      }
      return res.status(201).json({ message, conversationId: chat.id });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ORDER_CHAT_UNAVAILABLE") {
        return res.status(400).json({ message: "El chat no está disponible para este pedido." });
      }
      console.error("[stores] order customer chat send", e);
      return res.status(500).json({ message: "No se pudo enviar el mensaje." });
    }
  });

  app.get("/api/me/store-orders/:orderId/chat", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!orderId) return res.status(400).json({ message: "ID inválido." });
      const order = await appliaStorage.getStoreOrderForUser(userId, orderId);
      if (!order) return res.status(404).json({ message: "Pedido no encontrado." });
      const store = await appliaStorage.getStoreById(order.storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      const chat = await ensureStoreOrderCustomerConversation(appliaStorage, store, order);
      const { messages, hasMore } = await appliaStorage.getMessagesByConversation(chat.id, { limit: 50 });
      return res.json({
        conversationId: chat.id,
        messages,
        hasMore,
        chatLocked: chat.chatLocked,
        chatAvailable: true,
        branchName: order.branchName ?? null,
        storeName: store.name,
        whatsappPhone: store.whatsappPhone ?? null,
        whatsappDisplay: formatStoreWhatsappDisplay(store.whatsappPhone),
        whatsappUrl: buildStoreWhatsappUrl(
          store.whatsappPhone,
          `Hola, escribo sobre mi pedido #${order.id}`,
        ),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ORDER_CHAT_UNAVAILABLE") {
        return res.status(400).json({ message: "El chat no está disponible para este pedido." });
      }
      console.error("[stores] my order chat get", e);
      return res.status(500).json({ message: "No se pudo cargar el chat." });
    }
  });

  app.post("/api/me/store-orders/:orderId/chat/messages", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const orderId = parsePositiveIntParam(req.params.orderId);
      if (!orderId) return res.status(400).json({ message: "ID inválido." });
      const order = await appliaStorage.getStoreOrderForUser(userId, orderId);
      if (!order) return res.status(404).json({ message: "Pedido no encontrado." });
      const store = await appliaStorage.getStoreById(order.storeId);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });
      const parsed = storeChatSendMessageSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const chat = await ensureStoreOrderCustomerConversation(appliaStorage, store, order);
      if (chat.chatLocked) {
        return res.status(403).json({ message: "Este chat está cerrado." });
      }
      const message = await appliaStorage.createMessage({
        conversationId: chat.id,
        senderId: userId,
        content: parsed.data.content,
        type: parsed.data.type,
        status: "sent",
      });
      const preview = String(message.content ?? "").slice(0, 120);
      const { getIO } = await import("./socket");
      const io = getIO();
      if (io) {
        await broadcastStoreOrderCustomerChatActivity(
          io,
          appliaStorage,
          store,
          order,
          chat.id,
          preview,
          userId,
        );
      }
      return res.status(201).json({ message, conversationId: chat.id });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ORDER_CHAT_UNAVAILABLE") {
        return res.status(400).json({ message: "El chat no está disponible para este pedido." });
      }
      console.error("[stores] my order chat send", e);
      return res.status(500).json({ message: "No se pudo enviar el mensaje." });
    }
  });

  // ==================== Personal / usuarios de tienda ====================
  app.get("/api/stores/:storeId/staff", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      const access = await requireStoreAccess(userId, storeId, req.user?.role);
      if (!access.isOwner && !access.isPlatformAdmin && !access.isEmployee) {
        return res.status(403).json({ message: "No tienes permiso para ver los usuarios." });
      }

      const parsed = storeStaffListQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Parámetros inválidos.", errors: parsed.error.errors });
      }

      const members = await buildStoreStaffDirectory(access.store, {
        email: parsed.data.email,
        phone: parsed.data.phone,
        name: parsed.data.name,
        role: parsed.data.role,
        branchId: parsed.data.branchId,
      });

      return res.json({ members });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN") {
        return res.status(403).json({ message: "No tienes permiso para ver los usuarios." });
      }
      console.error("[stores] list staff", e);
      return res.status(500).json({ message: "No se pudieron cargar los usuarios." });
    }
  });

  app.patch("/api/stores/:storeId/staff/:memberUserId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      const memberUserId = String(req.params.memberUserId ?? "").trim();
      if (!storeId || !memberUserId) return res.status(400).json({ message: "ID inválido." });
      const access = await requireStoreStaffManagement(userId, storeId, req.user?.role);

      const parsed = updateStoreStaffMemberSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const memberUser = await appliaStorage.getUserById(memberUserId);
      if (!memberUser) return res.status(404).json({ message: "Usuario no encontrado." });
      if (memberUserId === access.store.ownerUserId && parsed.data.role === "employee") {
        return res.status(400).json({ message: "El dueño de la tienda no puede ser empleado." });
      }

      const branches = normalizeStoreBranches(access.store.branches, access.store.location ?? null);

      if (parsed.data.role === "client") {
        await appliaStorage.removeStoreStaffMember(storeId, memberUserId);
      } else {
        const branchId = parsed.data.branchId?.trim();
        if (!branchId || !resolveStoreBranch(branches, branchId)) {
          return res.status(400).json({ message: "Selecciona una sucursal válida." });
        }
        await appliaStorage.upsertStoreStaffMember(storeId, memberUserId, { branchId });
      }

      const members = await buildStoreStaffDirectory(access.store);
      const updated = members.find((m) => m.userId === memberUserId);
      return res.json({ member: updated ?? null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_FORBIDDEN") {
        return res.status(403).json({ message: "No tienes permiso para actualizar usuarios." });
      }
      console.error("[stores] patch staff member", e);
      return res.status(500).json({ message: "No se pudo actualizar el usuario." });
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

  // ==================== Banners / Popups (vitrina) ====================
  app.get("/api/stores/:storeId/showcase-ads", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);

      const [banners, popups] = await Promise.all([
        appliaStorage.listStoreShowcaseAds(storeId, "banner"),
        appliaStorage.listStoreShowcaseAds(storeId, "popup"),
      ]);
      return res.json({
        banners: banners.map(serializeShowcaseAdItem),
        popups: popups.map(serializeShowcaseAdItem),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] showcase-ads list", e);
      return res.status(500).json({ message: "No se pudieron cargar los banners y popups." });
    }
  });

  app.post("/api/stores/:storeId/showcase-ads", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);

      const parsed = insertStoreShowcaseAdItemSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }

      const created = await appliaStorage.createStoreShowcaseAdItem(storeId, parsed.data);
      return res.status(201).json({ item: serializeShowcaseAdItem(created) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] showcase-ads create", e);
      return res.status(500).json({ message: "No se pudo crear el banner o popup." });
    }
  });

  app.delete("/api/stores/:storeId/showcase-ads/:kind/:adId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const kind = String(req.params.kind ?? "") as StoreShowcaseAdKind;
      const adId = parsePositiveIntParam(req.params.adId);
      if (!storeId || !adId) return res.status(400).json({ message: "ID inválido." });
      if (kind !== "banner" && kind !== "popup") return res.status(400).json({ message: "Kind inválido." });

      await requireStoreOwner(userId, storeId);
      await appliaStorage.deleteStoreShowcaseAdItem(storeId, kind, adId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No tienes permiso para gestionar esta tienda." });
      console.error("[stores] showcase-ads delete", e);
      return res.status(500).json({ message: "No se pudo eliminar el banner o popup." });
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
      const paginationResult = parseOptionalAdminListPagination(req.query);
      if (!paginationResult.ok) {
        return res.status(400).json({ message: "Parámetros de paginación inválidos." });
      }
      const nameQuery = parseOptionalAdminListNameQuery(req.query);
      const products = await appliaStorage.listStoreProducts(storeId);
      const currency = normalizeStoreCurrencyFields(store);
      const serialized = filterSerializedListByName(
        products.map((p) =>
          serializeStoreProduct(p, {
            visualCurrencyId: currency.currencyVisualId,
            currencyExtras: currency.currencyExtras,
          }),
        ),
        nameQuery,
      );
      if (!paginationResult.pagination) {
        return res.json({ products: serialized });
      }
      const pageResult = paginateSerializedList(serialized, paginationResult.pagination);
      return res.json({
        products: pageResult.items,
        total: pageResult.total,
        page: pageResult.page,
        limit: pageResult.limit,
        totalPages: pageResult.totalPages,
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
      const sizes = normalizeStoreProductSizes(parsed.data.sizes);
      const priceError = assertProductSizesAndAdditionalsPrices(
        store,
        sizes,
        parsed.data.pricesByCurrency,
        parsed.data.ingredientAdditionals ?? [],
      );
      if (priceError) return res.status(400).json({ message: priceError });
      await assertStoreCategoryIds(storeId, parsed.data.categoryIds ?? []);
      const product = await appliaStorage.createStoreProduct(storeId, {
        ...parsed.data,
        sizes,
      });
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
      const existing = await appliaStorage.getStoreProduct(storeId, productId);
      if (!existing) return res.status(404).json({ message: "Producto no encontrado." });
      const sizes =
        parsed.data.sizes !== undefined
          ? normalizeStoreProductSizes(parsed.data.sizes)
          : existing.sizes ?? [];
      const mergedPrices = {
        ...(existing.pricesByCurrency ?? {}),
        ...(parsed.data.pricesByCurrency ?? {}),
      };
      if (parsed.data.price !== undefined && parsed.data.pricesByCurrency === undefined) {
        const currency = normalizeStoreCurrencyFields(store);
        mergedPrices[currency.currencyVisualId] = parsed.data.price;
      }
      const additionals =
        parsed.data.ingredientAdditionals ?? existing.ingredientAdditionals ?? [];
      const priceError = assertProductSizesAndAdditionalsPrices(
        store,
        sizes,
        mergedPrices,
        additionals,
      );
      if (priceError) return res.status(400).json({ message: priceError });
      if (parsed.data.categoryIds != null) {
        await assertStoreCategoryIds(storeId, parsed.data.categoryIds);
      }
      const product = await appliaStorage.updateStoreProduct(storeId, productId, {
        ...parsed.data,
        ...(parsed.data.sizes !== undefined ? { sizes } : {}),
      });
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

      const [banners, popups] = await Promise.all([
        appliaStorage.listStoreShowcaseAds(storeForView.id, "banner"),
        appliaStorage.listStoreShowcaseAds(storeForView.id, "popup"),
      ]);
      const serializedBanners = banners.map(serializeShowcaseAdItem);
      const serializedPopups = popups.map(serializeShowcaseAdItem);

      return res.json({
        products,
        categories,
        promotions,
        banners: serializedBanners,
        popups: serializedPopups,
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
      const access = await resolveStoreAccess(viewerId, store, req.user?.role);
      const canManageStore = access.isOwner || access.isPlatformAdmin || access.isEmployee;
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
        isEmployee: access.isEmployee,
        employeeBranchId: access.employeeBranchId,
        canManageStore,
        canManageStaff: access.canManageStaff,
        canFilterOrdersByBranch: access.canFilterOrdersByBranch,
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
      return await respondIngredientsPage(res, {
        q: parsed.data.q?.trim() || undefined,
        page: parsed.data.page,
        limit: parsed.data.limit,
      });
    } catch (e) {
      console.error("[ingredients-materials] list", e);
      return res.status(500).json({ message: "No se pudo listar ingredientes y materiales." });
    }
  });

  /** Búsqueda paginada (filtro obligatorio). */
  app.get("/api/ingredients-materials/search", async (req, res) => {
    try {
      const parsed = ingredientsSearchQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Parámetros inválidos.",
          errors: parsed.error.errors,
        });
      }
      return await respondIngredientsPage(res, {
        q: parsed.data.q,
        page: parsed.data.page,
        limit: parsed.data.limit,
      });
    } catch (e) {
      console.error("[ingredients-materials] search", e);
      return res.status(500).json({ message: "No se pudo buscar ingredientes y materiales." });
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
      return res.status(201).json({ item: serializeIngredientMaterial(item) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "INGREDIENT_MATERIAL_ALREADY_EXISTS") {
        return res.status(409).json({ message: "Ya existe un ingrediente o material con ese nombre." });
      }
      console.error("[ingredients-materials] create", e);
      return res.status(500).json({ message: "No se pudo crear el ingrediente o material." });
    }
  });

  async function handleUpdateIngredient(req: any, res: import("express").Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "ID inválido." });
      }
      const parsed = insertIngredientMaterialSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const item = await appliaStorage.updateIngredientMaterial(id, parsed.data);
      return res.json({ item: serializeIngredientMaterial(item) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "INGREDIENT_MATERIAL_NOT_FOUND") {
        return res.status(404).json({ message: "Ingrediente o material no encontrado." });
      }
      if (msg === "INGREDIENT_MATERIAL_ALREADY_EXISTS") {
        return res.status(409).json({ message: "Ya existe un ingrediente o material con ese nombre." });
      }
      console.error("[ingredients-materials] update", e);
      return res.status(500).json({ message: "No se pudo actualizar el ingrediente o material." });
    }
  }

  app.put("/api/ingredients-materials/:id", authenticateJWT, handleUpdateIngredient);
  app.patch("/api/ingredients-materials/:id", authenticateJWT, handleUpdateIngredient);

  app.delete("/api/ingredients-materials/:id", authenticateJWT, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "ID inválido." });
      }
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      await appliaStorage.deleteIngredientMaterial(id);
      return res.json({ ok: true, id });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "INGREDIENT_MATERIAL_NOT_FOUND") {
        return res.status(404).json({ message: "Ingrediente o material no encontrado." });
      }
      console.error("[ingredients-materials] delete", e);
      return res.status(500).json({ message: "No se pudo eliminar el ingrediente o material." });
    }
  });
}
