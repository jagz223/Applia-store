/**
 * Determina si una ficha de servicio pertenece a una marca/categoría (Pro Go, Man Go, etc.).
 * Solo la categoría de la **ficha** (`services.categoryId`), no las marcas del proveedor:
 * un asociado mixto debe listar pintura en Man Go y legal en Pro Go por separado.
 */
export function serviceBelongsToBrand(
  s: {
    categoryId?: unknown;
    category?: { slug?: string | null } | null;
  },
  brandCategoryId: number,
  categories: ReadonlyArray<{ id?: unknown; slug?: unknown }>,
): boolean {
  const brandId = Number(brandCategoryId);
  if (!Number.isFinite(brandId) || brandId <= 0) return false;
  if (Number(s?.categoryId) === brandId) return true;
  const brandSlug = categories
    .find((c) => Number(c?.id) === brandId)
    ?.slug;
  if (brandSlug == null) return false;
  return serviceListingCategorySlug(s, categories) === String(brandSlug).trim().toLowerCase();
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
