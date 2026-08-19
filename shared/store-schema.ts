import { z } from "zod";
import {
  STORE_CURRENCY_USD_ID,
  normalizeProductPricesByCurrency,
  normalizeStoreCurrencyAcceptedPaymentIds,
  normalizeStoreCurrencyExtras,
  normalizeStoreCurrencyVisualId,
  listKnownStoreCurrencyIds,
  storeCurrencyExtrasSchema,
  type StoreCurrencyExtra,
} from "./store-currency-schema";
import { storeFulfillmentOptionsSchema, type StoreFulfillmentMode } from "./store-fulfillment";
import { storeRubroIdSchema } from "./store-rubros";
import { haversineM } from "./maps-route-math";

export const storeNameSchema = z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120);

export const storeDescriptionSchema = z
  .string()
  .trim()
  .max(500, "La descripción no puede superar 500 caracteres");

export const insertStoreSchema = z.object({
  name: storeNameSchema,
});

export type InsertStore = z.infer<typeof insertStoreSchema>;

export const storeLocationSchema = z.object({
  lat: z.coerce.number().finite(),
  lon: z.coerce.number().finite(),
  label: z.string().trim().min(1, "La dirección es obligatoria").max(500),
});

export type StoreLocation = z.infer<typeof storeLocationSchema>;

export function normalizeStoreLocation(value: unknown): StoreLocation | null {
  if (value == null) return null;
  if (typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  if (raw.location != null && typeof raw.location === "object") {
    return normalizeStoreLocation(raw.location);
  }

  const latRaw = raw.lat ?? raw.latitude;
  const lonRaw = raw.lon ?? raw.longitude ?? raw.lng;
  const lat =
    typeof latRaw === "number"
      ? latRaw
      : typeof latRaw === "string"
        ? Number.parseFloat(latRaw)
        : Number.NaN;
  const lon =
    typeof lonRaw === "number"
      ? lonRaw
      : typeof lonRaw === "string"
        ? Number.parseFloat(lonRaw)
        : Number.NaN;
  const labelRaw = String(raw.label ?? raw.address ?? "").trim();
  const label =
    labelRaw ||
    (Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "");

  const parsed = storeLocationSchema.safeParse({ lat, lon, label });
  return parsed.success ? parsed.data : null;
}

export const STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE =
  "Se debe agregar una ubicación a la tienda para realizar la siguiente acción";

export const STORE_PRIMARY_BRANCH_ID = "primary";
export const STORE_BRANCH_MAX = 20;

export const storeBranchSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  location: storeLocationSchema.nullable(),
});

export type StoreBranch = z.infer<typeof storeBranchSchema>;

export function defaultStoreBranchName(index: number): string {
  return `Sucursal ${index + 1}`;
}

export function normalizeStoreBranches(
  value: unknown,
  fallbackLocation: StoreLocation | null = null,
): StoreBranch[] {
  const list: unknown[] = Array.isArray(value) ? value : [];
  const parsed: StoreBranch[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    const name = String(row.name ?? "").trim();
    seen.add(id);
    parsed.push({
      id,
      name: name || defaultStoreBranchName(parsed.length),
      location: normalizeStoreLocation(row.location),
    });
    if (parsed.length >= STORE_BRANCH_MAX) break;
  }

  const primaryFromList =
    parsed.find((b) => b.id === STORE_PRIMARY_BRANCH_ID) ?? parsed[0] ?? null;
  const extras = parsed.filter(
    (b) => b.id !== STORE_PRIMARY_BRANCH_ID && b.id !== primaryFromList?.id && b.location != null,
  );
  const primary: StoreBranch = {
    id: STORE_PRIMARY_BRANCH_ID,
    name: primaryFromList?.name?.trim() || defaultStoreBranchName(0),
    location: primaryFromList?.location ?? fallbackLocation ?? null,
  };
  return [primary, ...extras].slice(0, STORE_BRANCH_MAX);
}

export function storeBranchesWithLocation(
  branches: StoreBranch[],
): Array<StoreBranch & { location: StoreLocation }> {
  return branches.filter((b): b is StoreBranch & { location: StoreLocation } => b.location != null);
}

export function storeHasConfiguredLocation(
  branches: StoreBranch[] | null | undefined,
  fallbackLocation?: StoreLocation | null,
): boolean {
  return storeBranchesWithLocation(normalizeStoreBranches(branches, fallbackLocation ?? null)).length > 0;
}

export function resolveStoreBranch(
  branches: StoreBranch[],
  branchId?: string | null,
): StoreBranch | null {
  const id = String(branchId ?? "").trim();
  if (!id) return null;
  return branches.find((b) => b.id === id) ?? null;
}

export function findNearestStoreBranch(
  branches: StoreBranch[],
  point: { lat: number; lon: number },
): (StoreBranch & { location: StoreLocation }) | null {
  const located = storeBranchesWithLocation(branches);
  if (located.length === 0) return null;
  let best = located[0];
  let bestDist = haversineM(point, best.location);
  for (let i = 1; i < located.length; i += 1) {
    const d = haversineM(point, located[i].location);
    if (d < bestDist) {
      best = located[i];
      bestDist = d;
    }
  }
  return best;
}

export function resolveStoreLocationAndBranches(
  current: { location: StoreLocation | null; branches?: StoreBranch[] | null },
  input: { location?: StoreLocation | null; branches?: StoreBranch[] },
): { location: StoreLocation | null; branches: StoreBranch[] } {
  if (input.branches !== undefined) {
    const fallback =
      input.location !== undefined ? (input.location === null ? null : input.location) : current.location;
    const branches = normalizeStoreBranches(input.branches, fallback);
    return { location: branches[0]?.location ?? null, branches };
  }
  if (input.location !== undefined) {
    const loc = input.location === null ? null : normalizeStoreLocation(input.location) ?? input.location;
    const branches = normalizeStoreBranches(current.branches, loc);
    return { location: branches[0]?.location ?? null, branches };
  }
  const branches = normalizeStoreBranches(current.branches, current.location);
  return { location: branches[0]?.location ?? null, branches };
}

export function canEnableStoreFulfillmentOptions(
  options: StoreFulfillmentMode[],
  location: StoreLocation | null | undefined,
  branches?: StoreBranch[] | null,
): boolean {
  if (options.length === 0) return true;
  return storeHasConfiguredLocation(branches, location ?? null);
}

/** Tarifas de delivery propias de la tienda (base + por km + umbrales). */
export const storeDeliverySurchargeModeSchema = z.enum(["quantity", "weight"]);
export type StoreDeliverySurchargeMode = z.infer<typeof storeDeliverySurchargeModeSchema>;

export const storeDeliveryCostTierSchema = z.object({
  id: z.string().trim().min(1).max(64),
  /** 0 = tarifa por defecto (si no se cumple ningún otro umbral). */
  minValue: z.number().min(0).max(1_000_000),
  priceUsd: z.number().min(0).max(500),
});
export type StoreDeliveryCostTier = z.infer<typeof storeDeliveryCostTierSchema>;

export const DEFAULT_STORE_DELIVERY_FARES = {
  baseUsd: 1.75,
  perKmUsd: 0.5,
  surchargeMode: "quantity" as StoreDeliverySurchargeMode,
  costTiers: [{ id: "default", minValue: 0, priceUsd: 1.75 }] as StoreDeliveryCostTier[],
};

export const storeDeliveryFaresSchema = z.object({
  baseUsd: z.number().min(0).max(500),
  perKmUsd: z.number().min(0).max(50),
  surchargeMode: storeDeliverySurchargeModeSchema.optional().default("quantity"),
  costTiers: z.array(storeDeliveryCostTierSchema).max(50).optional().default([]),
});

export type StoreDeliveryFares = z.infer<typeof storeDeliveryFaresSchema>;

export type StoreDeliveryCartMetric = {
  itemCount: number;
  cartWeightKg: number;
};

function roundMoneyUsd(value: number): number {
  return Math.round((Math.max(0, value) + Number.EPSILON) * 100) / 100;
}

export function normalizeWeightKg(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((Math.min(n, 100_000) + Number.EPSILON) * 1000) / 1000;
}

export function normalizeStoreDeliveryCostTiers(
  value: unknown,
  fallbackPriceUsd: number,
): StoreDeliveryCostTier[] {
  const list: unknown[] = Array.isArray(value) ? value : [];
  const out: StoreDeliveryCostTier[] = [];
  const seenMin = new Set<number>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const parsed = storeDeliveryCostTierSchema.safeParse(raw);
    if (!parsed.success) continue;
    const minValue = Math.round((parsed.data.minValue + Number.EPSILON) * 1000) / 1000;
    if (seenMin.has(minValue)) continue;
    seenMin.add(minValue);
    const id = parsed.data.id.trim() || `tier_${out.length + 1}`;
    out.push({
      id,
      minValue,
      priceUsd: roundMoneyUsd(parsed.data.priceUsd),
    });
    if (out.length >= 50) break;
  }
  out.sort((a, b) => a.minValue - b.minValue || a.id.localeCompare(b.id));
  if (!out.some((t) => t.minValue === 0)) {
    out.unshift({
      id: "default",
      minValue: 0,
      priceUsd: roundMoneyUsd(fallbackPriceUsd),
    });
  }
  return out;
}

export function normalizeStoreDeliveryFares(value: unknown): StoreDeliveryFares {
  const parsed = storeDeliveryFaresSchema.safeParse(value);
  const baseUsd = parsed.success
    ? roundMoneyUsd(parsed.data.baseUsd)
    : DEFAULT_STORE_DELIVERY_FARES.baseUsd;
  const perKmUsd = parsed.success
    ? roundMoneyUsd(parsed.data.perKmUsd)
    : DEFAULT_STORE_DELIVERY_FARES.perKmUsd;
  const surchargeMode: StoreDeliverySurchargeMode =
    parsed.success && parsed.data.surchargeMode === "weight" ? "weight" : "quantity";
  const costTiers = normalizeStoreDeliveryCostTiers(
    parsed.success ? parsed.data.costTiers : [],
    baseUsd,
  );
  const defaultTier = costTiers.find((t) => t.minValue === 0) ?? costTiers[0];
  return {
    baseUsd: defaultTier ? defaultTier.priceUsd : baseUsd,
    perKmUsd,
    surchargeMode,
    costTiers,
  };
}

export function resolveStoreDeliveryBaseUsd(
  fares: StoreDeliveryFares,
  metric?: StoreDeliveryCartMetric | null,
): number {
  const normalized = normalizeStoreDeliveryFares(fares);
  const value =
    normalized.surchargeMode === "weight"
      ? Math.max(0, Number(metric?.cartWeightKg) || 0)
      : Math.max(0, Number(metric?.itemCount) || 0);
  const tiers = [...normalized.costTiers].sort((a, b) => b.minValue - a.minValue);
  for (const tier of tiers) {
    if (value >= tier.minValue) return tier.priceUsd;
  }
  return normalized.baseUsd;
}

export function computeStoreDeliveryFeeUsd(
  fares: StoreDeliveryFares,
  distanceM: number,
  metric?: StoreDeliveryCartMetric | null,
): number {
  const km = Math.max(0, (Number(distanceM) || 0) / 1000);
  const total = resolveStoreDeliveryBaseUsd(fares, metric) + km * Number(fares.perKmUsd);
  return roundMoneyUsd(total);
}

export type Store = {
  id: number;
  ownerUserId: string;
  name: string;
  slug: string;
  /** Texto breve visible en el catálogo de tiendas y vitrina. */
  description: string | null;
  /** Rubro / categoría de la tienda (ver shared/store-rubros). */
  rubro: string | null;
  /** Imagen de portada (catálogo y vitrina). */
  coverImageUrl: string | null;
  /** Ubicación física de la sucursal principal (mapa / GPS). */
  location: StoreLocation | null;
  /** Sucursales (la primera es la principal; el resto son extras). */
  branches: StoreBranch[];
  /** Modalidades habilitadas para el carrito (delivery, pickup, in_site). */
  fulfillmentOptions: StoreFulfillmentMode[];
  /** Precio del delivery de la tienda (base/umbrales + $/km). */
  deliveryFares: StoreDeliveryFares;
  /** Tasas manuales extra (nombre + valor en Bs), p. ej. Binance. */
  currencyExtras: StoreCurrencyExtra[];
  /** Moneda única mostrada en la vitrina (debe estar en currencyAcceptedPaymentIds). */
  currencyVisualId: string;
  /** Monedas aceptadas como pago; cada una exige precio en productos. */
  currencyAcceptedPaymentIds: string[];
  /** WhatsApp de atención al cliente (solo dígitos o formato internacional). */
  whatsappPhone: string | null;
  /** Cashea: pago vía WhatsApp (sin orden en sistema). */
  casheaEnabled: boolean;
  /** Vigencia de visibilidad pública (null = sin pago / inactiva). */
  visibilitySubscriptionEndsAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const updateStoreSchema = z.object({
  name: storeNameSchema.optional(),
  description: storeDescriptionSchema.nullable().optional(),
  rubro: storeRubroIdSchema.nullable().optional(),
  coverImageUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  location: storeLocationSchema.nullable().optional(),
  branches: z.array(storeBranchSchema).max(STORE_BRANCH_MAX).optional(),
  fulfillmentOptions: storeFulfillmentOptionsSchema.optional(),
  deliveryFares: storeDeliveryFaresSchema.optional(),
  currencyExtras: storeCurrencyExtrasSchema.optional(),
  currencyVisualId: z.string().trim().min(1).max(64).optional(),
  currencyAcceptedPaymentIds: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
  whatsappPhone: z.string().trim().max(24).nullable().optional(),
  casheaEnabled: z.boolean().optional(),
});

export type UpdateStore = z.infer<typeof updateStoreSchema>;

export function normalizeStoreCurrencyFields(input: {
  currencyExtras?: unknown;
  currencyVisualId?: unknown;
  currencyAcceptedPaymentIds?: unknown;
}): {
  currencyExtras: StoreCurrencyExtra[];
  currencyVisualId: string;
  currencyAcceptedPaymentIds: string[];
} {
  const currencyExtras = normalizeStoreCurrencyExtras(input.currencyExtras);
  const knownIds = listKnownStoreCurrencyIds(currencyExtras);
  const currencyAcceptedPaymentIds = normalizeStoreCurrencyAcceptedPaymentIds(
    input.currencyAcceptedPaymentIds,
    knownIds,
  );
  const currencyVisualId = normalizeStoreCurrencyVisualId(
    input.currencyVisualId,
    currencyAcceptedPaymentIds,
  );
  return { currencyExtras, currencyVisualId, currencyAcceptedPaymentIds };
}

export const STORE_PRODUCT_MAX_IMAGES = 1;
export const STORE_PRODUCT_MAX_SIZES = 20;

/** Tienda principal del sistema (Home, nav, /tienda). Cambiar aquí el id. */
export const PRIMARY_STORE_ID = 1;

export const storeProductSizeSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  pricesByCurrency: z.record(z.string().trim().min(1).max(64), z.number().positive()),
  /** Peso en kg de este tamaño. 0 si el producto no usa peso. */
  weight: z.number().min(0).max(100_000).optional().default(0),
});

export type StoreProductSize = z.infer<typeof storeProductSizeSchema>;

export function normalizeStoreProductSizes(value: unknown): StoreProductSize[] {
  const list: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value as Record<string, unknown>)
      : [];
  if (list.length === 0) return [];
  const out: StoreProductSize[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    const pricesByCurrency = normalizeProductPricesByCurrency(row.pricesByCurrency);
    if (Object.keys(pricesByCurrency).length === 0) continue;
    seen.add(id);
    out.push({ id, name, pricesByCurrency, weight: normalizeWeightKg(row.weight) });
    if (out.length >= STORE_PRODUCT_MAX_SIZES) break;
  }
  return out;
}

export function resolveStoreProductWeightFields(input: {
  hasWeight?: boolean;
  weight?: unknown;
  sizes: StoreProductSize[];
}): { hasWeight: boolean; weight: number; sizes: StoreProductSize[] } {
  const hasWeight = input.hasWeight === true;
  const sizes = input.sizes.map((s) => ({
    ...s,
    weight: hasWeight ? normalizeWeightKg(s.weight) : 0,
  }));
  if (!hasWeight) return { hasWeight: false, weight: 0, sizes };
  if (sizes.length > 0) return { hasWeight: true, weight: 0, sizes };
  return { hasWeight: true, weight: normalizeWeightKg(input.weight), sizes };
}

/** Precio de listado: el menor entre tamaños en la moneda visual. */
export function deriveProductPricesFromSizes(
  sizes: StoreProductSize[],
  visualCurrencyId: string = STORE_CURRENCY_USD_ID,
): { price: number; pricesByCurrency: Record<string, number> } | null {
  if (sizes.length === 0) return null;
  let best: StoreProductSize | null = null;
  let bestVisual = Infinity;
  for (const size of sizes) {
    const visual = size.pricesByCurrency[visualCurrencyId];
    const fallback =
      typeof visual === "number" && visual > 0
        ? visual
        : size.pricesByCurrency[STORE_CURRENCY_USD_ID] ??
          Object.values(size.pricesByCurrency)[0] ??
          0;
    if (fallback > 0 && fallback < bestVisual) {
      bestVisual = fallback;
      best = size;
    }
  }
  if (!best) {
    const first = sizes[0];
    return resolveStoreProductPriceFields(
      { pricesByCurrency: first.pricesByCurrency },
      visualCurrencyId,
    );
  }
  return resolveStoreProductPriceFields(
    { pricesByCurrency: best.pricesByCurrency },
    visualCurrencyId,
  );
}

export const storeProductIngredientAdditionalSchema = z.object({
  ingredientMaterialId: z.number().int().positive(),
  /**
   * Precio en moneda visual (compat / listado).
   * Con tamaños se deriva del menor o del primer tamaño configurado.
   */
  price: z.number().positive(),
  /** Precios por moneda cuando el producto NO tiene tamaños. */
  pricesByCurrency: z
    .record(z.string().trim().min(1).max(64), z.number().positive())
    .optional()
    .default({}),
  /** Con tamaños: sizeId → (currencyId → monto). */
  pricesBySize: z
    .record(
      z.string().trim().min(1).max(64),
      z.record(z.string().trim().min(1).max(64), z.number().positive()),
    )
    .optional()
    .default({}),
});

export type StoreProductIngredientAdditional = z.infer<typeof storeProductIngredientAdditionalSchema>;

export function normalizeStoreProductIngredientAdditionals(
  value: unknown,
): StoreProductIngredientAdditional[] {
  if (!Array.isArray(value)) return [];
  const out: StoreProductIngredientAdditional[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const ingredientMaterialId = Number(row.ingredientMaterialId);
    if (!Number.isFinite(ingredientMaterialId) || ingredientMaterialId <= 0) continue;
    if (seen.has(ingredientMaterialId)) continue;

    const pricesByCurrency = normalizeProductPricesByCurrency(row.pricesByCurrency);
    const pricesBySizeRaw =
      row.pricesBySize && typeof row.pricesBySize === "object" && !Array.isArray(row.pricesBySize)
        ? (row.pricesBySize as Record<string, unknown>)
        : {};
    const pricesBySize: Record<string, Record<string, number>> = {};
    for (const [sizeId, currencyMap] of Object.entries(pricesBySizeRaw)) {
      const id = String(sizeId ?? "").trim();
      if (!id) continue;
      const normalized = normalizeProductPricesByCurrency(currencyMap);
      if (Object.keys(normalized).length === 0) continue;
      pricesBySize[id] = normalized;
    }

    let price =
      typeof row.price === "number"
        ? row.price
        : Number.parseFloat(String(row.price ?? ""));
    if (!Number.isFinite(price) || price <= 0) {
      const fromCurrency = Object.values(pricesByCurrency)[0];
      const fromSize = Object.values(pricesBySize)[0];
      const fromSizeCurrency = fromSize ? Object.values(fromSize)[0] : undefined;
      price = fromCurrency ?? fromSizeCurrency ?? 0;
    }
    if (!Number.isFinite(price) || price <= 0) continue;

    seen.add(ingredientMaterialId);
    out.push({
      ingredientMaterialId,
      price: Math.round(price * 100) / 100,
      pricesByCurrency,
      pricesBySize,
    });
  }
  return out;
}

/** Resuelve el precio de un adicional en moneda visual, opcionalmente por tamaño. */
export function resolveAdditionalDisplayPrice(
  additional: StoreProductIngredientAdditional,
  visualCurrencyId: string,
  sizeId?: string | null,
): number {
  if (sizeId) {
    const bySize = additional.pricesBySize?.[sizeId];
    if (bySize) {
      const visual = bySize[visualCurrencyId];
      if (typeof visual === "number" && visual > 0) return visual;
      const usd = bySize[STORE_CURRENCY_USD_ID];
      if (typeof usd === "number" && usd > 0) return usd;
      const first = Object.values(bySize)[0];
      if (typeof first === "number" && first > 0) return first;
    }
  }
  const map = additional.pricesByCurrency ?? {};
  const visual = map[visualCurrencyId];
  if (typeof visual === "number" && visual > 0) return visual;
  const usd = map[STORE_CURRENCY_USD_ID];
  if (typeof usd === "number" && usd > 0) return usd;
  return Number(additional.price) || 0;
}

export function normalizePositiveIntIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Normaliza y valida relaciones entre ingredientes base, removibles y adicionales.
 * Los removibles y adicionales deben pertenecer a la lista base; los adicionales no
 * pueden coincidir con los removibles.
 */
export function normalizeStoreProductIngredientOptions(input: {
  ingredientMaterialIds?: unknown;
  removableIngredientMaterialIds?: unknown;
  ingredientAdditionals?: unknown;
}): {
  ingredientMaterialIds: number[];
  removableIngredientMaterialIds: number[];
  ingredientAdditionals: StoreProductIngredientAdditional[];
} {
  const ingredientMaterialIds = normalizePositiveIntIdList(input.ingredientMaterialIds);
  const base = new Set(ingredientMaterialIds);
  const removableIngredientMaterialIds = normalizePositiveIntIdList(
    input.removableIngredientMaterialIds,
  ).filter((id) => base.has(id));
  const removable = new Set(removableIngredientMaterialIds);
  const ingredientAdditionals = normalizeStoreProductIngredientAdditionals(
    input.ingredientAdditionals,
  ).filter(
    (item) => base.has(item.ingredientMaterialId) && !removable.has(item.ingredientMaterialId),
  );
  return { ingredientMaterialIds, removableIngredientMaterialIds, ingredientAdditionals };
}

export const insertStoreProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  price: z.number().positive(),
  pricesByCurrency: z
    .record(z.string().trim().min(1).max(64), z.number().positive())
    .optional()
    .default({}),
  /** Tamaños del producto (vacío = un solo precio base). */
  sizes: z.array(storeProductSizeSchema).max(STORE_PRODUCT_MAX_SIZES).optional().default([]),
  categoryIds: z.array(z.number().int().positive()).optional().default([]),
  ingredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
  /** Subconjunto de ingredientMaterialIds que el cliente puede quitar (≥2 base para usarlo). */
  removableIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
  /** Extras opcionales con precio; deben estar en la base y no en removibles. */
  ingredientAdditionals: z.array(storeProductIngredientAdditionalSchema).optional().default([]),
  imageUrls: z
    .array(z.string().trim().min(1).max(2000))
    .max(STORE_PRODUCT_MAX_IMAGES)
    .optional()
    .default([]),
  /** Si el producto aparece en la vitrina pública de la tienda. */
  showOnShowcase: z.boolean().optional().default(true),
  /** Si está activo, el peso entra en el cálculo de delivery por kg. */
  hasWeight: z.boolean().optional().default(false),
  /** Peso en kg cuando el producto no tiene tamaños. 0 si hasWeight es false. */
  weight: z.number().min(0).max(100_000).optional().default(0),
});

export type InsertStoreProduct = z.infer<typeof insertStoreProductSchema>;

export const updateStoreProductSchema = insertStoreProductSchema.partial();

export type UpdateStoreProduct = z.infer<typeof updateStoreProductSchema>;

export type StoreProduct = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  price: number;
  /** Precio por moneda aceptada como pago (id → monto). Sin tamaños, o derivado (mínimo) si hay tamaños. */
  pricesByCurrency: Record<string, number>;
  /** Tamaños con precio propio por moneda. Vacío = producto sin variantes de tamaño. */
  sizes: StoreProductSize[];
  categoryIds: number[];
  ingredientMaterialIds: number[];
  removableIngredientMaterialIds: number[];
  ingredientAdditionals: StoreProductIngredientAdditional[];
  imageUrls: string[];
  showOnShowcase: boolean;
  hasWeight: boolean;
  weight: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function resolveStoreProductUnitWeightKg(
  product: Pick<StoreProduct, "hasWeight" | "weight" | "sizes">,
  sizeId?: string | null,
): number {
  if (!product.hasWeight) return 0;
  const sizes = product.sizes ?? [];
  if (sizes.length > 0) {
    const wanted = String(sizeId ?? "").trim();
    if (wanted) {
      const size = sizes.find((s) => s.id === wanted);
      return normalizeWeightKg(size?.weight);
    }
    let min = Infinity;
    for (const size of sizes) {
      const w = normalizeWeightKg(size.weight);
      if (w > 0 && w < min) min = w;
    }
    return Number.isFinite(min) ? min : 0;
  }
  return normalizeWeightKg(product.weight);
}

export function resolveStoreProductPriceFields(
  input: { price?: number; pricesByCurrency?: unknown },
  visualCurrencyId: string = STORE_CURRENCY_USD_ID,
): { price: number; pricesByCurrency: Record<string, number> } {
  const pricesByCurrency = normalizeProductPricesByCurrency(input.pricesByCurrency);
  const visualPrice = pricesByCurrency[visualCurrencyId];
  const price =
    typeof visualPrice === "number" && visualPrice > 0
      ? visualPrice
      : typeof input.price === "number" && input.price > 0
        ? input.price
        : pricesByCurrency[STORE_CURRENCY_USD_ID] ?? 0;
  if (price > 0 && pricesByCurrency[visualCurrencyId] == null) {
    pricesByCurrency[visualCurrencyId] = price;
  }
  if (price > 0 && pricesByCurrency[STORE_CURRENCY_USD_ID] == null && visualCurrencyId === STORE_CURRENCY_USD_ID) {
    pricesByCurrency[STORE_CURRENCY_USD_ID] = price;
  }
  return { price, pricesByCurrency };
}

export const ingredientMaterialNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(200);

export const insertIngredientMaterialSchema = z.object({
  name: ingredientMaterialNameSchema,
});

export type InsertIngredientMaterial = z.infer<typeof insertIngredientMaterialSchema>;

export const updateIngredientMaterialSchema = insertIngredientMaterialSchema;

export type UpdateIngredientMaterial = z.infer<typeof updateIngredientMaterialSchema>;

export type IngredientMaterial = {
  id: number;
  name: string;
  /** Clave normalizada (trim + lower) para unicidad case-insensitive. */
  normalizedName: string;
  createdAt: Date | string;
};

export const INGREDIENTS_MATERIALS_PAGE_SIZE = 20;

export const insertStoreCategorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  productIds: z.array(z.number().int().positive()).optional().default([]),
  /**
   * Si true, los productos de esta categoría no aparecen en el filtro «Todo» de la vitrina;
   * sí al filtrar por esta u otras categorías a las que pertenezcan.
   */
  hideFromShowcaseAll: z.boolean().optional().default(false),
});

export type InsertStoreCategory = z.infer<typeof insertStoreCategorySchema>;

export const updateStoreCategorySchema = insertStoreCategorySchema.partial();

export type UpdateStoreCategory = z.infer<typeof updateStoreCategorySchema>;

export type StoreCategory = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  hideFromShowcaseAll: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const storePromotionStatusSchema = z.enum(["active", "inactive"]);

export type StorePromotionStatus = z.infer<typeof storePromotionStatusSchema>;

export const storePromotionLineItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(9999),
  status: storePromotionStatusSchema.default("active"),
});

export type StorePromotionLineItem = z.infer<typeof storePromotionLineItemSchema>;

export const insertStorePromotionSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  /** Imagen propia de la promoción (vitrina y admin). */
  imageUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  price: z.number().positive("El precio debe ser mayor a cero"),
  items: z
    .array(storePromotionLineItemSchema)
    .min(1, "Debe incluir al menos un producto")
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: "No puedes repetir el mismo producto en la promoción",
    }),
  status: storePromotionStatusSchema.optional().default("active"),
});

export type InsertStorePromotion = z.infer<typeof insertStorePromotionSchema>;

export const updateStorePromotionSchema = insertStorePromotionSchema.partial();

export type UpdateStorePromotion = z.infer<typeof updateStorePromotionSchema>;

export type StorePromotion = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  items: StorePromotionLineItem[];
  status: StorePromotionStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function computeCartDeliveryWeightKg(
  lines: Array<{
    kind: "product" | "promotion";
    quantity: number;
    productId?: number;
    promotionId?: number;
    sizeId?: string | null;
  }>,
  products: StoreProduct[],
  promotions: StorePromotion[],
): number {
  const productById = new Map(products.map((p) => [p.id, p]));
  const promotionById = new Map(promotions.map((p) => [p.id, p]));
  let total = 0;
  for (const line of lines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty <= 0) continue;
    if (line.kind === "product") {
      const product = line.productId != null ? productById.get(line.productId) : undefined;
      if (!product) continue;
      total += resolveStoreProductUnitWeightKg(product, line.sizeId) * qty;
      continue;
    }
    const promotion = line.promotionId != null ? promotionById.get(line.promotionId) : undefined;
    if (!promotion) continue;
    let promoUnit = 0;
    for (const item of promotion.items ?? []) {
      if (item.status === "inactive") continue;
      const product = productById.get(item.productId);
      if (!product) continue;
      promoUnit += resolveStoreProductUnitWeightKg(product, null) * Math.max(0, Number(item.quantity) || 0);
    }
    total += promoUnit * qty;
  }
  return normalizeWeightKg(total);
}

/** Imagen para vitrina/carrito: propia de la promoción o, si no hay, del primer producto del pack. */
export function resolveStorePromotionImageUrl(
  promotion: Pick<StorePromotion, "imageUrl" | "items">,
  products: Pick<StoreProduct, "id" | "imageUrls">[],
): string | null {
  const own = promotion.imageUrl?.trim();
  if (own) return own;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const item of promotion.items) {
    const url = byId.get(item.productId)?.imageUrls?.[0]?.trim();
    if (url) return url;
  }
  return null;
}
