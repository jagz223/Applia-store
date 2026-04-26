/**
 * Car Go = categoría de proveedor con slug `transport` (nombre comercial Car Go).
 */

export type ProviderCategoryRef = {
  category?: string | null;
  categoryId?: number | null;
};

export type CategorySlugRow = { id: number; slug?: string | null };

export function isCarGoProvider(
  provider: ProviderCategoryRef | null | undefined,
  categories?: readonly CategorySlugRow[]
): boolean {
  // Back-compat: Car Go es el módulo "transport". Si el provider tiene `goBrands`, también lo respetamos.
  const p = provider as (ProviderCategoryRef & { goBrands?: string[] | null }) | null | undefined;
  if (!p) return false;
  if (Array.isArray(p.goBrands) && p.goBrands.map((s) => String(s ?? "").trim().toLowerCase()).includes("transport")) return true;
  const slug = String(p.category ?? "").trim().toLowerCase();
  if (slug === "transport") return true;
  if (categories != null && p.categoryId != null) {
    const id = Number(p.categoryId);
    if (!Number.isFinite(id)) return false;
    const row = categories.find((c) => c.id === id);
    if (String(row?.slug ?? "").trim().toLowerCase() === "transport") return true;
  }
  return false;
}
