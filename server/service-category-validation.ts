import type { Category } from "@shared/schema";
import { isCatalogAssignableServiceCategorySlug } from "@shared/catalog-service-categories";
import { createServiceRequiresSubcategory } from "@shared/create-service-catalog-context";
import { slugForCategoryId } from "@shared/provider-category-membership";

export type CatalogSubcategoryLookup = {
  getSubcategoryById(id: number): Promise<{ categoryId: number } | undefined>;
};

export function validateAssignableServiceCategory(category: Category | undefined): { ok: true } | { ok: false; message: string } {
  const slug = String((category as { slug?: string } | undefined)?.slug ?? "");
  if (!isCatalogAssignableServiceCategorySlug(slug)) {
    return {
      ok: false,
      message: "Solo puedes publicar en categorías de catálogo: Man Go o Pro Go.",
    };
  }
  return { ok: true };
}

export type ProviderServiceRow = {
  id: number;
  categoryId: number;
  subcategoryId?: number | null;
};

/**
 * Man Go / Pro Go: una ficha por subcategoría (p. ej. computación y plomería por separado).
 * Otras categorías de catálogo sin subcategoría obligatoria: una ficha por categoría.
 */
export function providerHasDuplicateCatalogService(
  services: ReadonlyArray<ProviderServiceRow>,
  categoryId: number,
  subcategoryId: number | null | undefined,
  categories: ReadonlyArray<{ id?: unknown; slug?: string | null }>,
  excludeServiceId?: number,
): boolean {
  const cid = Number(categoryId);
  const slug = slugForCategoryId(cid, categories);

  if (createServiceRequiresSubcategory(slug)) {
    const subId = subcategoryId != null ? Number(subcategoryId) : NaN;
    if (!Number.isFinite(subId) || subId <= 0) return false;
    return services.some(
      (s) =>
        Number(s.categoryId) === cid &&
        Number(s.subcategoryId) === subId &&
        (excludeServiceId == null || Number(s.id) !== Number(excludeServiceId)),
    );
  }

  return services.some(
    (s) => Number(s.categoryId) === cid && (excludeServiceId == null || Number(s.id) !== Number(excludeServiceId)),
  );
}

/** @deprecated Usar providerHasDuplicateCatalogService */
export function providerHasServiceInCategory(
  services: ReadonlyArray<{ id: number; categoryId: number }>,
  categoryId: number,
  excludeServiceId?: number,
): boolean {
  return providerHasDuplicateCatalogService(
    services.map((s) => ({ ...s, subcategoryId: null })),
    categoryId,
    null,
    [],
    excludeServiceId,
  );
}

export async function validateCatalogServiceSubcategoryForCategory(
  catalog: CatalogSubcategoryLookup,
  subcategoryId: number | null | undefined,
  categoryId: number,
  categories: readonly Pick<Category, "id" | "slug">[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const slug = slugForCategoryId(categoryId, categories);
  if (createServiceRequiresSubcategory(slug)) {
    const subId = subcategoryId != null ? Number(subcategoryId) : NaN;
    if (!Number.isFinite(subId) || subId <= 0) {
      return { ok: false, message: "Selecciona una subcategoría." };
    }
  }
  return validateSubcategoryBelongsToCategory(catalog, subcategoryId, categoryId);
}

export async function validateSubcategoryBelongsToCategory(
  catalog: CatalogSubcategoryLookup,
  subcategoryId: number | null | undefined,
  categoryId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (subcategoryId == null || Number.isNaN(Number(subcategoryId))) return { ok: true };
  const sub = await catalog.getSubcategoryById(Number(subcategoryId));
  if (!sub) return { ok: false, message: "Subcategoría no válida." };
  if (Number(sub.categoryId) !== Number(categoryId)) {
    return { ok: false, message: "La subcategoría no corresponde a la categoría del servicio." };
  }
  return { ok: true };
}
