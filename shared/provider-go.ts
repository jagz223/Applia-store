/**
 * Marcas Car Go habilitadas para un proveedor (`transport`, `delivery`).
 *
 * Modelo:
 * - `providers.category/categoryId` = categoría principal (p. ej. transport, delivery, marketplace).
 * - `goBrands` = módulos Car Go activos (taxi y/o envíos). Marketplace no va en `goBrands`.
 *
 * La UI arma la navegación y permisos usando estas funciones.
 */
import { CAR_GO_BRAND_SLUGS, MARKETPLACE_CATEGORY_SLUG } from "./default-categories";
import { sanitizeCarGoBrands, type CarGoBrandSlug } from "./go-brands";
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
  slug: CarGoBrandSlug,
  categories?: readonly CategorySlugRow[]
): boolean {
  if (!provider) return false;
  const target = normalizeSlug(slug);
  if (target === MARKETPLACE_CATEGORY_SLUG) {
    const direct = normalizeSlug(provider.category);
    if (direct === MARKETPLACE_CATEGORY_SLUG) return true;
    if (categories != null && provider.categoryId != null) {
      const id = Number(provider.categoryId);
      if (Number.isFinite(id)) {
        const row = categories.find((c) => c.id === id);
        if (normalizeSlug(row?.slug) === MARKETPLACE_CATEGORY_SLUG) return true;
      }
    }
    return false;
  }

  const brands = sanitizeCarGoBrands(provider.goBrands).map(normalizeSlug);
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

