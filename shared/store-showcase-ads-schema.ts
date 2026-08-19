import { z } from "zod";

export const storeShowcaseAdKindSchema = z.enum(["banner", "popup"]);
export type StoreShowcaseAdKind = z.infer<typeof storeShowcaseAdKindSchema>;

export const storeShowcaseAdItemSchema = z.object({
  id: z.number().int().positive(),
  storeId: z.number().int().positive(),
  kind: storeShowcaseAdKindSchema,
  imageUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

export type StoreShowcaseAdItem = z.infer<typeof storeShowcaseAdItemSchema>;

const optionalNullableUrl = z
  .string()
  .url()
  .optional()
  .nullable();

export const insertStoreShowcaseAdItemSchema = z
  .object({
    kind: storeShowcaseAdKindSchema,
    imageUrl: optionalNullableUrl,
    linkUrl: optionalNullableUrl,
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine((d) => Boolean(d.imageUrl || d.linkUrl), {
    message: "Debes indicar al menos una imagen o un link.",
    path: ["imageUrl"],
  });

export type InsertStoreShowcaseAdItem = z.infer<typeof insertStoreShowcaseAdItemSchema>;

// Para update usamos un schema "parcial" sin aplicar refine (este proyecto no
// usa update en el carrusel por ahora; esto es solo para tipos/consistencia).
export const updateStoreShowcaseAdItemSchema = z
  .object({
    kind: storeShowcaseAdKindSchema.optional(),
    imageUrl: optionalNullableUrl.optional(),
    linkUrl: optionalNullableUrl.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .partial();
export type UpdateStoreShowcaseAdItem = z.infer<typeof updateStoreShowcaseAdItemSchema>;

