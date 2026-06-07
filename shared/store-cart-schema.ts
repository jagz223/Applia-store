import { z } from "zod";

/** Vigencia del carrito por tienda (se renueva en cada modificación). */
export const STORE_CART_TTL_MS = 24 * 60 * 60 * 1000;

export const storeCartProductItemSchema = z.object({
  kind: z.literal("product"),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(9999),
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

export const addStoreCartItemSchema = z.object({
  kind: z.enum(["product", "promotion"]),
  productId: z.number().int().positive().optional(),
  promotionId: z.number().int().positive().optional(),
  quantity: z.number().int().positive().max(9999).optional().default(1),
}).superRefine((data, ctx) => {
  if (data.kind === "product" && !data.productId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "productId es obligatorio" });
  }
  if (data.kind === "promotion" && !data.promotionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promotionId es obligatorio" });
  }
});

export type AddStoreCartItem = z.infer<typeof addStoreCartItemSchema>;

export const updateStoreCartItemSchema = z.object({
  kind: z.enum(["product", "promotion"]),
  productId: z.number().int().positive().optional(),
  promotionId: z.number().int().positive().optional(),
  quantity: z.number().int().min(0).max(9999),
}).superRefine((data, ctx) => {
  if (data.kind === "product" && !data.productId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "productId es obligatorio" });
  }
  if (data.kind === "promotion" && !data.promotionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promotionId es obligatorio" });
  }
});

export type UpdateStoreCartItem = z.infer<typeof updateStoreCartItemSchema>;

export const removeStoreCartItemSchema = z.object({
  kind: z.enum(["product", "promotion"]),
  productId: z.number().int().positive().optional(),
  promotionId: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  if (data.kind === "product" && !data.productId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "productId es obligatorio" });
  }
  if (data.kind === "promotion" && !data.promotionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promotionId es obligatorio" });
  }
});

export type RemoveStoreCartItem = z.infer<typeof removeStoreCartItemSchema>;

export type StoreCart = {
  userId: string;
  storeId: number;
  items: StoreCartItem[];
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
