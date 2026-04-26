/**
 * Módulos Go habilitados para un proveedor.
 *
 * Modelo:
 * - Históricamente, `providers.category/categoryId` era UNA sola categoría (ej. transport = Car Go).
 * - Para permitir que un conductor Car Go también use Pack Go / Shop Go, guardamos un arreglo opcional
 *   `goBrands: string[]` en el perfil del proveedor (Firestore/memoria; no requiere migración SQL).
 *
 * La UI arma la navegación y permisos usando esta función.
 */
export type ProviderGoRef = {
  category?: string | null;
  categoryId?: number | null;
  goBrands?: string[] | null;
};

export type CategorySlugRow = { id: number; slug?: string | null };

function normalizeSlug(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function providerHasGoBrand(
  provider: ProviderGoRef | null | undefined,
  slug: "transport" | "delivery" | "marketplace",
  categories?: readonly CategorySlugRow[]
): boolean {
  if (!provider) return false;
  const target = normalizeSlug(slug);

  const brands = Array.isArray(provider.goBrands) ? provider.goBrands.map(normalizeSlug).filter(Boolean) : [];
  if (brands.includes(target)) return true;

  const direct = normalizeSlug(provider.category);
  if (direct === target) return true;

  if (categories != null && provider.categoryId != null) {
    const id = Number(provider.categoryId);
    if (Number.isFinite(id)) {
      const row = categories.find((c) => c.id === id);
      if (normalizeSlug(row?.slug) === target) return true;
    }
  }
  return false;
}

