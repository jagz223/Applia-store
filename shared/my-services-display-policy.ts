import type { ServiceWithProvider } from "@shared/schema";
import { isSelfServiceCatalogActiveToggleDisallowedForCategorySlug } from "@shared/catalog-service-visibility-policy";

export type MyServicesCardListResult = {
  /** Filas a renderizar debajo de la vista previa conductor (orden por título). */
  rows: ServiceWithProvider[];
  /**
   * Todos los servicios del proveedor son Go (taxi / envíos / marketplace): no queda ninguna
   * fila en el listado porque esa parte vive en la vista previa de conductor.
   * No aplica si `catalogVisibilitySuspended` (suscripción vencida: se listan todas las fichas).
   */
  allServicesWereGoCatalogOnly: boolean;
};

export type ComputeMyServicesCardRowsInput = {
  services: readonly ServiceWithProvider[];
  showDriverPreview: boolean;
  /** Suscripción de catálogo vencida: mostrar todas las fichas (solo lectura en UI). */
  catalogVisibilitySuspended?: boolean;
};

function serviceCategorySlug(s: ServiceWithProvider): string {
  return String(s.category?.slug ?? "").trim().toLowerCase();
}

function isGoCatalogServiceRow(s: ServiceWithProvider): boolean {
  return isSelfServiceCatalogActiveToggleDisallowedForCategorySlug(serviceCategorySlug(s));
}

/**
 * Con vista previa de conductor activa, las fichas de catálogo Go (transport / delivery / marketplace)
 * no se duplican abajo: la vista previa es la fuente de verdad. El resto de categorías sigue listado.
 */
export function computeMyServicesCardRows(args: ComputeMyServicesCardRowsInput): MyServicesCardListResult {
  const sortedByTitle = [...args.services].sort((a, b) => (a.title || "").localeCompare(b.title || "", "es"));
  if (args.services.length === 0) {
    return { rows: [], allServicesWereGoCatalogOnly: false };
  }

  if (args.catalogVisibilitySuspended) {
    return { rows: sortedByTitle, allServicesWereGoCatalogOnly: false };
  }

  if (!args.showDriverPreview) {
    return { rows: sortedByTitle, allServicesWereGoCatalogOnly: false };
  }

  const rows = sortedByTitle.filter((s) => !isGoCatalogServiceRow(s));
  const allServicesWereGoCatalogOnly = rows.length === 0;
  return { rows, allServicesWereGoCatalogOnly };
}
