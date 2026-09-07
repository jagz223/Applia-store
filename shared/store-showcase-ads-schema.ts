import { z } from "zod";

export const storeShowcaseAdKindSchema = z.enum(["banner", "popup"]);
export type StoreShowcaseAdKind = z.infer<typeof storeShowcaseAdKindSchema>;

/** Solo aplica a banners. Popups ignora estos campos. */
export const storeShowcaseBannerCategoryVisibilityModeSchema = z.enum([
  "all",
  "exclude",
  "include",
]);
export type StoreShowcaseBannerCategoryVisibilityMode = z.infer<
  typeof storeShowcaseBannerCategoryVisibilityModeSchema
>;

export const STORE_SHOWCASE_BANNER_CATEGORY_VISIBILITY_DEFAULT: StoreShowcaseBannerCategoryVisibilityMode =
  "all";

export function normalizeBannerCategoryVisibility(
  mode: unknown,
  categoryIds: unknown,
): {
  categoryVisibilityMode: StoreShowcaseBannerCategoryVisibilityMode;
  categoryIds: number[];
} {
  const parsedMode = storeShowcaseBannerCategoryVisibilityModeSchema.safeParse(mode);
  const categoryVisibilityMode = parsedMode.success
    ? parsedMode.data
    : STORE_SHOWCASE_BANNER_CATEGORY_VISIBILITY_DEFAULT;

  const ids: number[] = [];
  if (Array.isArray(categoryIds)) {
    const seen = new Set<number>();
    for (const raw of categoryIds) {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      const id = Math.trunc(n);
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= 100) break;
    }
  }

  if (categoryVisibilityMode === "all") {
    return { categoryVisibilityMode: "all", categoryIds: [] };
  }
  return { categoryVisibilityMode, categoryIds: ids };
}

/**
 * ¿El banner debe mostrarse con el filtro actual de la vitrina?
 * - Filtro global (`all`): solo `all` y `exclude` (nunca `include`).
 * - Categoría N: `all`; `exclude` si N no está excluida; `include` si N está incluida.
 */
export function bannerVisibleForShowcaseCategoryFilter(
  banner: {
    categoryVisibilityMode?: StoreShowcaseBannerCategoryVisibilityMode | null;
    categoryIds?: number[] | null;
  },
  categoryFilter: "all" | "promotions" | number,
): boolean {
  const { categoryVisibilityMode, categoryIds } = normalizeBannerCategoryVisibility(
    banner.categoryVisibilityMode,
    banner.categoryIds,
  );

  if (categoryFilter === "promotions") {
    // En promociones no hay categoría de producto: solo banners globales / exclude.
    return categoryVisibilityMode === "all" || categoryVisibilityMode === "exclude";
  }

  if (categoryFilter === "all") {
    return categoryVisibilityMode === "all" || categoryVisibilityMode === "exclude";
  }

  const idSet = new Set(categoryIds);
  if (categoryVisibilityMode === "all") return true;
  if (categoryVisibilityMode === "exclude") return !idSet.has(categoryFilter);
  if (categoryVisibilityMode === "include") return idSet.has(categoryFilter);
  return true;
}

export const storeShowcaseAdItemSchema = z.object({
  id: z.number().int().positive(),
  storeId: z.number().int().positive(),
  kind: storeShowcaseAdKindSchema,
  imageUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  sortOrder: z.number().int().nonnegative(),
  categoryVisibilityMode: storeShowcaseBannerCategoryVisibilityModeSchema.default("all"),
  categoryIds: z.array(z.number().int().positive()).max(100).default([]),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

export type StoreShowcaseAdItem = z.infer<typeof storeShowcaseAdItemSchema>;

const optionalNullableUrl = z
  .string()
  .url()
  .optional()
  .nullable();

const bannerVisibilityFields = {
  categoryVisibilityMode: storeShowcaseBannerCategoryVisibilityModeSchema.optional(),
  categoryIds: z.array(z.number().int().positive()).max(100).optional(),
};

function refineBannerVisibility(
  d: {
    kind?: StoreShowcaseAdKind;
    categoryVisibilityMode?: StoreShowcaseBannerCategoryVisibilityMode;
    categoryIds?: number[];
  },
  ctx: z.RefinementCtx,
) {
  if (d.kind === "popup") return;
  const mode = d.categoryVisibilityMode ?? "all";
  if (mode === "all") return;
  if (!d.categoryIds || d.categoryIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona al menos una categoría.",
      path: ["categoryIds"],
    });
  }
}

export const insertStoreShowcaseAdItemSchema = z
  .object({
    kind: storeShowcaseAdKindSchema,
    imageUrl: optionalNullableUrl,
    linkUrl: optionalNullableUrl,
    sortOrder: z.number().int().nonnegative().optional(),
    ...bannerVisibilityFields,
  })
  .superRefine((d, ctx) => {
    if (!d.imageUrl && !d.linkUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes indicar al menos una imagen o un link.",
        path: ["imageUrl"],
      });
    }
    refineBannerVisibility(d, ctx);
  });

export type InsertStoreShowcaseAdItem = z.infer<typeof insertStoreShowcaseAdItemSchema>;

export const updateStoreShowcaseAdItemSchema = z
  .object({
    imageUrl: optionalNullableUrl,
    linkUrl: optionalNullableUrl,
    sortOrder: z.number().int().nonnegative().optional(),
    ...bannerVisibilityFields,
  })
  .superRefine((d, ctx) => {
    // En update el kind viene del path; si mandan mode include/exclude, exigir categorías.
    const mode = d.categoryVisibilityMode;
    if (mode === "include" || mode === "exclude") {
      if (!d.categoryIds || d.categoryIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecciona al menos una categoría.",
          path: ["categoryIds"],
        });
      }
    }
  });
export type UpdateStoreShowcaseAdItem = z.infer<typeof updateStoreShowcaseAdItemSchema>;
