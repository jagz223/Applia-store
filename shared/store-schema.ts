import { z } from "zod";
import { storeFulfillmentOptionsSchema, type StoreFulfillmentMode } from "./store-fulfillment";
import { storeRubroIdSchema } from "./store-rubros";

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

export function canEnableStoreFulfillmentOptions(
  options: StoreFulfillmentMode[],
  location: StoreLocation | null | undefined,
): boolean {
  if (options.length === 0) return true;
  return location != null;
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
  /** Ubicación física de la tienda (mapa / GPS). */
  location: StoreLocation | null;
  /** Modalidades habilitadas para el carrito (delivery, pickup, in_site). */
  fulfillmentOptions: StoreFulfillmentMode[];
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
  fulfillmentOptions: storeFulfillmentOptionsSchema.optional(),
});

export type UpdateStore = z.infer<typeof updateStoreSchema>;

export const STORE_PRODUCT_MAX_IMAGES = 4;

export const insertStoreProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  price: z.number().positive(),
  categoryIds: z.array(z.number().int().positive()).optional().default([]),
  ingredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
  imageUrls: z
    .array(z.string().trim().min(1).max(2000))
    .max(STORE_PRODUCT_MAX_IMAGES)
    .optional()
    .default([]),
  /** Si el producto aparece en la vitrina pública de la tienda. */
  showOnShowcase: z.boolean().optional().default(true),
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
  categoryIds: number[];
  ingredientMaterialIds: number[];
  imageUrls: string[];
  showOnShowcase: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const ingredientMaterialNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(200);

export const insertIngredientMaterialSchema = z.object({
  name: ingredientMaterialNameSchema,
});

export type InsertIngredientMaterial = z.infer<typeof insertIngredientMaterialSchema>;

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
});

export type InsertStoreCategory = z.infer<typeof insertStoreCategorySchema>;

export const updateStoreCategorySchema = insertStoreCategorySchema.partial();

export type UpdateStoreCategory = z.infer<typeof updateStoreCategorySchema>;

export type StoreCategory = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
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
