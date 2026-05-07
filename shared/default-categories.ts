/**
 * Categorías por defecto del sistema (único sistema para servicios y proveedores).
 * Se usan en seed de categorías y en migración. Slug = identificador único para mapear provider.category (string) → categoryId.
 * Nota: "Servicios Legales" y "Consultoría Financiera" no son categorías aquí; solo existen como subcategorías en default-subcategories.ts (seeder de subcategorías).
 */

/**
 * Slugs ocultos en la UI hasta que el admin los active vía Firestore (`hiddenCategorySlugs`).
 * Los slugs `delivery` y `marketplace` siguen ocultos por defecto en la UI; Car Go (`transport`) no: su visibilidad la controla solo el admin.
 */
export const HIDDEN_CATEGORY_SLUGS_IN_UI: ReadonlyArray<string> = ["delivery", "marketplace"];

/**
 * Lista efectiva de slugs ocultos.
 * - Si el backend devuelve una lista, esa lista manda (el admin puede activar Pack/Shop).
 * - Si aún no hay configuración (o la API no está disponible), usamos el default oculto.
 */
export function effectiveHiddenCategorySlugs(apiHidden: string[] | undefined | null): string[] {
  if (Array.isArray(apiHidden)) return Array.from(new Set(apiHidden.map((s) => String(s ?? "").trim()).filter(Boolean)));
  return [...HIDDEN_CATEGORY_SLUGS_IN_UI];
}

/** Nombres de marca para mostrar en la UI (Familia GenFeb). Solo afecta la visualización. */
/** Car / Shop / Pack Go tienen vistas propias (Go); no deben mezclarse en el catálogo general de Explorar. */
export const MOBILITY_GO_PROVIDER_SLUGS = ["transport", "marketplace", "delivery"] as const;

export const CATEGORY_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  technical: "Fix Go",
  professional: "Pro Go",
  maintenance: "Man Go",
  delivery: "Pack Go",
  marketplace: "Shop Go",
  transport: "Car Go",
} as const;

/** Devuelve el nombre de marca para una categoría (por slug) o el nombre original si no hay mapeo. */
export function getCategoryDisplayName(category: { slug?: string; name?: string } | null | undefined): string {
  if (!category) return "";
  const slug = (category as { slug?: string }).slug;
  if (slug && slug in CATEGORY_DISPLAY_NAMES) return (CATEGORY_DISPLAY_NAMES as Record<string, string>)[slug];
  return (category as { name?: string }).name ?? "";
}

/**
 * Nombre “canónico” del catálogo (título en seed / DEFAULT_CATEGORIES), sin marcas tipo “Go”.
 * Útil en formularios públicos (p. ej. registro de proveedor).
 */
export function getCategoryCanonicalName(category: { slug?: string; name?: string } | null | undefined): string {
  if (!category) return "";
  const slug = String((category as { slug?: string }).slug ?? "").trim();
  if (slug) {
    const row = DEFAULT_CATEGORIES.find((c) => c.slug === slug);
    if (row) return row.name;
  }
  return String((category as { name?: string }).name ?? "").trim();
}

export const DEFAULT_CATEGORIES: ReadonlyArray<{
  slug: string;
  name: string;
  type: string;
  icon: string;
  imageUrl?: string;
}> = [
  { slug: "technical", name: "Servicios Técnicos", type: "technical", icon: "Wrench" },
  { slug: "professional", name: "Servicios Profesionales", type: "profession", icon: "Briefcase" },
  { slug: "maintenance", name: "Mantenimiento", type: "technical", icon: "Home" },
  { slug: "delivery", name: "Delivery", type: "technical", icon: "Package" },
  { slug: "marketplace", name: "Marketplace", type: "technical", icon: "Store" },
  { slug: "transport", name: "Servicios de transporte (Taxi)", type: "technical", icon: "Car" },
];
