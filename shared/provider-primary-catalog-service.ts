import { isCatalogAssignableServiceCategorySlug } from "./catalog-service-categories";
import { normalizeProviderCategorySlug } from "./default-categories";

/** Referencia mínima de un servicio de catálogo (Man Go / Pro Go). */
export type CatalogServiceIdentity = {
  id: number;
  categoryId?: number | null;
  category?: { slug?: string | null } | null;
};

export function catalogServiceSlug(service: CatalogServiceIdentity): string {
  const fromCategory = service.category?.slug;
  if (typeof fromCategory === "string" && fromCategory.trim()) {
    return normalizeProviderCategorySlug(fromCategory);
  }
  return "";
}

export function filterCatalogAssignableServices<T extends CatalogServiceIdentity>(
  services: readonly T[],
): T[] {
  return services.filter((s) => isCatalogAssignableServiceCategorySlug(catalogServiceSlug(s)));
}

/**
 * Ficha principal = la del registro (categoría del proveedor), desempate por menor id.
 * Los servicios adicionales pueden cambiar de marca o eliminarse.
 */
export function resolvePrimaryCatalogServiceId(
  services: readonly CatalogServiceIdentity[],
  registrationCategoryId: number | null | undefined,
): number | null {
  const catalog = filterCatalogAssignableServices(services);
  if (!catalog.length) return null;

  const regId = Number(registrationCategoryId);
  if (Number.isFinite(regId) && regId > 0) {
    const inRegistrationCategory = catalog.filter((s) => Number(s.categoryId) === regId);
    if (inRegistrationCategory.length > 0) {
      return Math.min(...inRegistrationCategory.map((s) => Number(s.id)));
    }
  }

  return Math.min(...catalog.map((s) => Number(s.id)));
}

export function isPrimaryProviderCatalogService(
  serviceId: number,
  services: readonly CatalogServiceIdentity[],
  registrationCategoryId: number | null | undefined,
): boolean {
  const primaryId = resolvePrimaryCatalogServiceId(services, registrationCategoryId);
  return primaryId != null && Number(serviceId) === primaryId;
}

export function canChangeCatalogServiceCategory(
  serviceId: number,
  services: readonly CatalogServiceIdentity[],
  registrationCategoryId: number | null | undefined,
): boolean {
  return !isPrimaryProviderCatalogService(serviceId, services, registrationCategoryId);
}

export function canDeleteCatalogService(
  serviceId: number,
  services: readonly CatalogServiceIdentity[],
  registrationCategoryId: number | null | undefined,
): boolean {
  return !isPrimaryProviderCatalogService(serviceId, services, registrationCategoryId);
}
