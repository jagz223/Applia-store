import type { Category } from "@shared/schema";
import { isCatalogAssignableServiceCategorySlug } from "@shared/catalog-service-categories";

export type CatalogSubcategoryLookup = {
  getSubcategoryById(id: number): Promise<{ categoryId: number } | undefined>;
};

export function validateAssignableServiceCategory(category: Category | undefined): { ok: true } | { ok: false; message: string } {
  const slug = String((category as { slug?: string } | undefined)?.slug ?? "");
  if (!isCatalogAssignableServiceCategorySlug(slug)) {
    return {
      ok: false,
      message:
        "Solo puedes publicar en categorías de catálogo: Servicios técnicos, Servicios profesionales o Mantenimiento.",
    };
  }
  return { ok: true };
}

/** True si otro servicio del mismo proveedor ya usa `categoryId` (excluye `excludeServiceId` si se edita). */
export function providerHasServiceInCategory(
  services: ReadonlyArray<{ id: number; categoryId: number }>,
  categoryId: number,
  excludeServiceId?: number
): boolean {
  const cid = Number(categoryId);
  return services.some((s) => Number(s.categoryId) === cid && (excludeServiceId == null || Number(s.id) !== Number(excludeServiceId)));
}

export async function validateSubcategoryBelongsToCategory(
  catalog: CatalogSubcategoryLookup,
  subcategoryId: number | null | undefined,
  categoryId: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (subcategoryId == null || Number.isNaN(Number(subcategoryId))) return { ok: true };
  const sub = await catalog.getSubcategoryById(Number(subcategoryId));
  if (!sub) return { ok: false, message: "Subcategoría no válida." };
  if (Number(sub.categoryId) !== Number(categoryId)) {
    return { ok: false, message: "La subcategoría no corresponde a la categoría del servicio." };
  }
  return { ok: true };
}
