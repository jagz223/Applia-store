/**
 * Categorías por defecto del sistema (único sistema para servicios y proveedores).
 * Se usan en seed de categorías y en migración. Slug = identificador único para mapear provider.category (string) → categoryId.
 * Nota: "Servicios Legales" y "Consultoría Financiera" no son categorías aquí; solo existen como subcategorías en default-subcategories.ts (seeder de subcategorías).
 */

/** Slugs ocultos en la UI (vista categorías, explorar, configurarse como profesional) hasta que se activen. */
export const HIDDEN_CATEGORY_SLUGS_IN_UI: ReadonlyArray<string> = ["delivery", "marketplace", "transport"];

/**
 * Lista efectiva de slugs ocultos: siempre incluye las marcas desactivadas por defecto
 * (Pack Go / Shop Go / Car Go) y se une con lo que venga de la API o Firestore.
 * Así nunca se muestran chips de marcas desactivadas por un `hiddenSlugs` incompleto o vacío.
 */
export function effectiveHiddenCategorySlugs(apiHidden: string[] | undefined | null): string[] {
  const extra = Array.isArray(apiHidden) ? apiHidden : [];
  return Array.from(new Set([...HIDDEN_CATEGORY_SLUGS_IN_UI, ...extra]));
}

/** Nombres de marca para mostrar en la UI (Familia GenFeb). Solo afecta la visualización. */
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
