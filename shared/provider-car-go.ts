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
  if (!provider) return false;
  const slug = String(provider.category ?? "").trim().toLowerCase();
  if (slug === "transport") return true;
  if (categories != null && provider.categoryId != null) {
    const id = Number(provider.categoryId);
    if (!Number.isFinite(id)) return false;
    const row = categories.find((c) => c.id === id);
    if (String(row?.slug ?? "").trim().toLowerCase() === "transport") return true;
  }
  return false;
}
