import { providerHasCategoryId } from "./provider-category-membership";

/**
 * Determina si una ficha de servicio pertenece a una marca/categoría (Pro Go, Man Go, etc.).
 * Usa la categoría del **servicio** y todas las categorías del proveedor (principal + secundarias).
 */
export function serviceBelongsToBrand(
  s: {
    categoryId?: unknown;
    provider?: {
      categoryId?: unknown;
      secondCategoryId?: unknown;
      thirdCategoryId?: unknown;
      category?: unknown;
    } | undefined;
  },
  brandCategoryId: number,
  categories: ReadonlyArray<{ id?: unknown; slug?: unknown }>,
): boolean {
  if (Number(s?.categoryId) === brandCategoryId) return true;
  const p = s?.provider;
  if (!p) return false;
  if (providerHasCategoryId(p as import("./provider-category-membership").ProviderCategorySlots, brandCategoryId))
    return true;
  const slug = categories.find((c) => Number(c?.id) === brandCategoryId)?.slug;
  if (slug != null && typeof p.category === "string" && p.category.trim() === String(slug)) return true;
  return false;
}

/** Slug de la categoría del servicio (ficha), no del proveedor. */
export function serviceListingCategorySlug(
  s: { categoryId?: unknown; category?: { slug?: string | null } | null },
  categories: ReadonlyArray<{ id?: unknown; slug?: unknown }>,
): string {
  const fromJoin = String(s.category?.slug ?? "").trim().toLowerCase();
  if (fromJoin) return fromJoin;
  const id = Number(s.categoryId);
  if (!Number.isFinite(id)) return "";
  const row = categories.find((c) => Number(c.id) === id);
  return String(row?.slug ?? "").trim().toLowerCase();
}
