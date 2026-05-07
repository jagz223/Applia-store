import { DEFAULT_SUBCATEGORIES } from "./default-subcategories";

/**
 * Slugs que solo deben existir como subcategorías (`sub_categories`), no como filas en `categories`.
 * Evita que migraciones antiguas (p. ej. legal/financial como categoría superior) aparezcan en Explorar/Home como pares de Pro Go.
 */
export const RESERVED_SUBCATEGORY_SLUGS: ReadonlySet<string> = new Set(
  DEFAULT_SUBCATEGORIES.map((s) => String(s.slug ?? "").trim().toLowerCase()).filter(Boolean),
);

export function excludeLegacySubcategoryCategoryDocuments<T extends { slug?: string | null }>(
  categories: T[],
): T[] {
  return categories.filter((c) => {
    const slug = String(c.slug ?? "").trim().toLowerCase();
    if (!slug) return true;
    return !RESERVED_SUBCATEGORY_SLUGS.has(slug);
  });
}
