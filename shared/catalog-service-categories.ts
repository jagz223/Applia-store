/**
 * Categorías de catálogo (Explorar) en las que un asociado puede publicar una ficha de servicio.
 * Excluye movilidad / Go (taxi, marketplace, delivery): esas líneas tienen flujos propios.
 */
import { MAN_GO_CATEGORY_SLUG } from "./default-categories";

export const CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS = [MAN_GO_CATEGORY_SLUG, "professional"] as const;

export type CatalogAssignableServiceCategorySlug = (typeof CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS)[number];

export function isCatalogAssignableServiceCategorySlug(slug: string | undefined | null): slug is CatalogAssignableServiceCategorySlug {
  const s = String(slug ?? "").trim();
  return (CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS as readonly string[]).includes(s);
}
