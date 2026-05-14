import { isMobilityGoDriverVehicleCategorySlug } from "@shared/default-categories";

/**
 * Política: taxi, delivery y marketplace no exponen activar/pausar ficha
 * en el panel genérico de asociado (flujo Go / conductor).
 */
export function isSelfServiceCatalogActiveToggleDisallowedForCategorySlug(
  slug: string | null | undefined,
): boolean {
  return isMobilityGoDriverVehicleCategorySlug(slug);
}
