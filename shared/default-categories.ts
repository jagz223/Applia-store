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

/** Nombres de marca para mostrar en la UI (Familia Applia). Solo afecta la visualización. */
/** Slug de categoría Marketplace (plataforma propia; no forma parte de Car Go). */
export const MARKETPLACE_CATEGORY_SLUG = "marketplace" as const;

/**
 * Marcas dentro de Car Go (misma familia conductor: taxi + envíos).
 * Marketplace quedó fuera; ver {@link MARKETPLACE_CATEGORY_SLUG}.
 */
export const CAR_GO_BRAND_SLUGS = ["transport", "delivery"] as const;

/** @deprecated Usar {@link CAR_GO_BRAND_SLUGS}. */
export const MOBILITY_GO_PROVIDER_SLUGS = CAR_GO_BRAND_SLUGS;

/** Taxi o delivery: categorías de proveedor Go que llevan datos de vehículo / flota. */
export function isMobilityGoDriverVehicleCategorySlug(slug: string | null | undefined): boolean {
  const s = String(slug ?? "").trim().toLowerCase();
  return (CAR_GO_BRAND_SLUGS as readonly string[]).includes(s);
}

/**
 * Man Go unificado: antes Fix Go (`technical`) + Man Go (`maintenance`) en una sola categoría en BD.
 * El slug canónico sigue siendo `technical` para no romper integraciones existentes.
 */
export const MAN_GO_CATEGORY_SLUG = "technical" as const;

/**
 * Categorías retiradas del catálogo (no deben ofrecerse en registro ni recrearse con seed).
 * Los documentos legacy en Firestore pueden seguir existiendo; la UI y el seed las ignoran.
 */
export const RETIRED_PROVIDER_CATEGORY_SLUGS = ["maintenance"] as const;

const RETIRED_SLUG_SET = new Set(
  RETIRED_PROVIDER_CATEGORY_SLUGS.map((s) => s.toLowerCase()),
);

export function isRetiredProviderCategorySlug(slug: string | null | undefined): boolean {
  return RETIRED_SLUG_SET.has(String(slug ?? "").trim().toLowerCase());
}

/** Normaliza slugs legacy (p. ej. asociados que aún tengan `category: "maintenance"` en texto). */
export function normalizeProviderCategorySlug(slug: string | null | undefined): string {
  const s = String(slug ?? "").trim().toLowerCase();
  if (s === "maintenance") return MAN_GO_CATEGORY_SLUG;
  return s;
}

/**
 * Slugs que no se devuelven en `GET /api/categories` (lista pública: home, explorar, categorías, registro asociado).
 * Así se evita duplicar “CarGo” (taxi + delivery) aunque existan ambos documentos en Firestore o el admin muestre delivery.
 */
export const CATEGORY_SLUGS_EXCLUDED_FROM_PUBLIC_API = ["delivery"] as const;

export function filterCategoriesExcludedFromPublicApi<T extends { slug?: string | null }>(
  categories: readonly T[],
): T[] {
  const excluded = new Set(CATEGORY_SLUGS_EXCLUDED_FROM_PUBLIC_API.map((s) => s.toLowerCase()));
  return categories.filter((c) => {
    const slug = String(c.slug ?? "").trim().toLowerCase();
    if (excluded.has(slug)) return false;
    if (isRetiredProviderCategorySlug(slug)) return false;
    return true;
  });
}

/** Slugs activos para registro de proveedor / chips de explorar (excluye retirados y Go con flujo propio si aplica). */
export function isActiveProviderCategorySlug(slug: string | null | undefined): boolean {
  const s = normalizeProviderCategorySlug(slug);
  if (!s || isRetiredProviderCategorySlug(s)) return false;
  return DEFAULT_CATEGORIES.some((c) => c.slug === s);
}

export const CATEGORY_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  technical: "Man Go",
  professional: "Pro Go",
  delivery: "Delivery",
  marketplace: "Shop Go",
  transport: "Car Go",
} as const;

/** Devuelve el nombre de marca para una categoría (por slug) o el nombre original si no hay mapeo. */
export function getCategoryDisplayName(category: { slug?: string; name?: string } | null | undefined): string {
  if (!category) return "";
  const slug = normalizeProviderCategorySlug((category as { slug?: string }).slug);
  if (slug && slug in CATEGORY_DISPLAY_NAMES) return (CATEGORY_DISPLAY_NAMES as Record<string, string>)[slug];
  return (category as { name?: string }).name ?? "";
}

/**
 * Nombre “canónico” del catálogo (título en seed / DEFAULT_CATEGORIES), sin marcas tipo “Go”.
 * Útil en formularios públicos (p. ej. registro de proveedor).
 */
export function getCategoryCanonicalName(category: { slug?: string; name?: string } | null | undefined): string {
  if (!category) return "";
  const slug = normalizeProviderCategorySlug((category as { slug?: string }).slug);
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
  { slug: "technical", name: "Man Go", type: "technical", icon: "Wrench" },
  { slug: "professional", name: "Servicios Profesionales", type: "profession", icon: "Briefcase" },
  { slug: "delivery", name: "Delivery", type: "technical", icon: "Package" },
  { slug: "marketplace", name: "Marketplace", type: "technical", icon: "Store" },
  { slug: "transport", name: "Servicios de transporte (Taxi)", type: "technical", icon: "Car" },
];
