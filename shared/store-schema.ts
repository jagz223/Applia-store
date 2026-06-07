import { z } from "zod";
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
