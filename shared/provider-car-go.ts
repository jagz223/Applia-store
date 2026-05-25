/**
 * Car Go = categoría de proveedor con slug `transport` (nombre comercial Car Go).
 */

import { isMobilityGoDriverVehicleCategorySlug } from "@shared/default-categories";

export type ProviderCategoryRef = {
  category?: string | null;
  categoryId?: number | null;
};

export type CategorySlugRow = { id: number; slug?: string | null };

/**
 * Conductor Go con vehículo: categoría o marcas Car Go (`transport`, `delivery`).
 * @see CAR_GO_BRAND_SLUGS
 */
export function isGoVehicleProvider(
  provider: ProviderCategoryRef | null | undefined,
  categories?: readonly CategorySlugRow[]
): boolean {
  const p = provider as (ProviderCategoryRef & { goBrands?: string[] | null }) | null | undefined;
  if (!p) return false;
  if (Array.isArray(p.goBrands)) {
    const brands = p.goBrands.map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
    if (brands.some((b) => isMobilityGoDriverVehicleCategorySlug(b))) return true;
  }
  const slug = String(p.category ?? "").trim().toLowerCase();
  if (isMobilityGoDriverVehicleCategorySlug(slug)) return true;
  if (categories != null && p.categoryId != null) {
    const id = Number(p.categoryId);
    if (!Number.isFinite(id)) return false;
    const row = categories.find((c) => c.id === id);
    if (isMobilityGoDriverVehicleCategorySlug(String(row?.slug ?? ""))) return true;
  }
  return false;
}

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
