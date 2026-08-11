import { z } from "zod";
import { storeFulfillmentModeSchema, type StoreFulfillmentMode } from "./store-fulfillment";

/** Vigencia del carrito por tienda (se renueva en cada modificación). */
export const STORE_CART_TTL_MS = 24 * 60 * 60 * 1000;

function normalizePositiveIntIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** IDs de personalización ordenados y únicos (clave de línea de carrito). */
export function normalizeCartCustomizationIds(value: unknown): number[] {
  return normalizePositiveIntIdList(value);
}

export function storeCartProductLineKey(input: {
  productId: number;
  sizeId?: string | null;
  removedIngredientMaterialIds?: number[];
  additionalIngredientMaterialIds?: number[];
}): string {
  const sizeId = String(input.sizeId ?? "").trim();
  const removed = normalizeCartCustomizationIds(input.removedIngredientMaterialIds ?? []);
  const additionals = normalizeCartCustomizationIds(input.additionalIngredientMaterialIds ?? []);
  return `p:${input.productId}:s:${sizeId}:r:${removed.join(",")}:a:${additionals.join(",")}`;
}

/**
 * Nombre de vitrina/carrito:
 * `base [tamaño] + adicionales - quitados`
 */
export function buildCustomizedProductDisplayName(
  baseName: string,
  additionalNames: string[],
  removedNames: string[] = [],
  sizeName?: string | null,
): string {
  const base = baseName.trim();
  const size = String(sizeName ?? "").trim();
  const extras = additionalNames.map((n) => n.trim()).filter(Boolean);
  const removed = removedNames.map((n) => n.trim()).filter(Boolean);
  const parts = [size ? `${base} ${size}` : base];
  for (const n of extras) parts.push(`+ ${n}`);
  for (const n of removed) parts.push(`- ${n}`);
  return parts.join(" ");
}

export const storeCartProductItemSchema = z.object({
  kind: z.literal("product"),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(9999),
  /** Tamaño elegido (obligatorio si el producto tiene tamaños). */
  sizeId: z.string().trim().min(1).max(64).optional().nullable(),
  /** Ingredientes/materiales que el cliente eligió quitar. */
  removedIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
  /** Adicionales elegidos (ids de ingredientMaterial). */
  additionalIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
});

export const storeCartPromotionItemSchema = z.object({
  kind: z.literal("promotion"),
  promotionId: z.number().int().positive(),
  quantity: z.number().int().positive().max(99),
});

export const storeCartItemSchema = z.discriminatedUnion("kind", [
  storeCartProductItemSchema,
  storeCartPromotionItemSchema,
]);

export type StoreCartProductItem = z.infer<typeof storeCartProductItemSchema>;
export type StoreCartPromotionItem = z.infer<typeof storeCartPromotionItemSchema>;
export type StoreCartItem = z.infer<typeof storeCartItemSchema>;

export const addStoreCartItemSchema = z
  .object({
    kind: z.enum(["product", "promotion"]),
    productId: z.number().int().positive().optional(),
    promotionId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().max(9999).optional().default(1),
    sizeId: z.string().trim().min(1).max(64).optional().nullable(),
    removedIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
    additionalIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "product" && !data.productId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "productId es obligatorio" });
    }
    if (data.kind === "promotion" && !data.promotionId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promotionId es obligatorio" });
    }
  });

export type AddStoreCartItem = z.infer<typeof addStoreCartItemSchema>;

export const updateStoreCartItemSchema = z
  .object({
    kind: z.enum(["product", "promotion"]),
    productId: z.number().int().positive().optional(),
    promotionId: z.number().int().positive().optional(),
    quantity: z.number().int().min(0).max(9999),
    sizeId: z.string().trim().min(1).max(64).optional().nullable(),
    /** Identifica la variante de producto (misma clave que al añadir). */
    removedIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
    additionalIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
    /** Alternativa: clave de línea ya enriquecida. */
    lineKey: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "product" && !data.productId && !data.lineKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "productId es obligatorio" });
    }
    if (data.kind === "promotion" && !data.promotionId && !data.lineKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promotionId es obligatorio" });
    }
  });

export type UpdateStoreCartItem = z.infer<typeof updateStoreCartItemSchema>;

export const removeStoreCartItemSchema = z
  .object({
    kind: z.enum(["product", "promotion"]),
    productId: z.number().int().positive().optional(),
    promotionId: z.number().int().positive().optional(),
    sizeId: z.string().trim().min(1).max(64).optional().nullable(),
    removedIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
    additionalIngredientMaterialIds: z.array(z.number().int().positive()).optional().default([]),
    lineKey: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "product" && !data.productId && !data.lineKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "productId es obligatorio" });
    }
    if (data.kind === "promotion" && !data.promotionId && !data.lineKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promotionId es obligatorio" });
    }
  });

export type RemoveStoreCartItem = z.infer<typeof removeStoreCartItemSchema>;

export const updateStoreCartFulfillmentSchema = z.object({
  fulfillmentMode: storeFulfillmentModeSchema.nullable(),
});

export type UpdateStoreCartFulfillment = z.infer<typeof updateStoreCartFulfillmentSchema>;

export type StoreCart = {
  userId: string;
  storeId: number;
  items: StoreCartItem[];
  /** Modalidad elegida por el cliente (una sola). */
  fulfillmentMode: StoreFulfillmentMode | null;
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
