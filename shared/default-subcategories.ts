import { normalizeProviderCategorySlug } from "./default-categories";

/**
 * Subcategorías por defecto del sistema.
 * Cada subcategoría está asociada a una categoría (por slug de la categoría).
 * Se usan en seed-subcategories; el seeder resuelve categorySlug → categoryId en Firestore.
 *
 * - Pro Go (`professional`): Servicios Legales, Consultoría Financiera, Tutorías.
 * - Man Go (`technical`): oficios técnicos + mantenimiento (plomería, limpieza, aires, etc.).
 * - Car Go (`transport`): tipo de vehículo (moto, auto, etc.).
 *
 * No usar `maintenance` como categoría padre: está retirada; todo Man Go va bajo `technical`.
 */
export const DEFAULT_SUBCATEGORIES: ReadonlyArray<{  slug: string;
  name: string;
  categorySlug: string;
  icon?: string;
}> = [
  /** ——— Pro Go ——— */
  { slug: "legal", name: "Servicios Legales", categorySlug: "professional", icon: "Scale" },
  { slug: "financial", name: "Consultoría Financiera", categorySlug: "professional", icon: "TrendingUp" },
  { slug: "tutoring", name: "Tutorías", categorySlug: "professional", icon: "GraduationCap" },

  /** ——— Man Go (slug `technical`) ——— */
  { slug: "plumbing", name: "Plomería", categorySlug: "technical", icon: "Droplets" },
  { slug: "electrical", name: "Electricidad", categorySlug: "technical", icon: "Zap" },
  { slug: "appliances", name: "Reparación de Electrodomésticos", categorySlug: "technical", icon: "Microwave" },
  { slug: "locksmith", name: "Cerrajería", categorySlug: "technical", icon: "KeyRound" },
  { slug: "computing", name: "Computación / Electrónica", categorySlug: "technical", icon: "Cpu" },
  { slug: "cleaning", name: "Limpieza", categorySlug: "technical", icon: "Sparkles" },
  { slug: "ac_maintenance", name: "Mantenimiento de Aires Acondicionados", categorySlug: "technical", icon: "Wind" },
  { slug: "gardening", name: "Jardinería", categorySlug: "technical", icon: "Trees" },
  { slug: "painting", name: "Pintura", categorySlug: "technical", icon: "Paintbrush" },

  /** Car Go (`transport`): tipo de vehículo */
  { slug: "moto", name: "Moto", categorySlug: "transport", icon: "Bike" },
  { slug: "auto", name: "Auto", categorySlug: "transport", icon: "Car" },
  { slug: "camioneta", name: "Camioneta", categorySlug: "transport", icon: "Truck" },
  { slug: "truck", name: "Camión", categorySlug: "transport", icon: "Construction" },
];

/** Slug canónico de categoría padre al crear o reparar subcategorías (p. ej. `maintenance` → `technical`). */
export function getSubcategoryParentCategorySlug(categorySlug: string): string {
  return normalizeProviderCategorySlug(categorySlug);
}

const defaultSubSlugsByParent = new Map<string, Set<string>>();
for (const sub of DEFAULT_SUBCATEGORIES) {
  const parent = getSubcategoryParentCategorySlug(sub.categorySlug);
  let set = defaultSubSlugsByParent.get(parent);
  if (!set) {
    set = new Set();
    defaultSubSlugsByParent.set(parent, set);
  }
  set.add(sub.slug);
}

/** Indica si un slug de subcategoría pertenece al catálogo por defecto bajo el padre canónico dado. */
export function isDefaultSubcategoryForParent(subSlug: string, parentCategorySlug: string): boolean {
  const parent = getSubcategoryParentCategorySlug(parentCategorySlug);
  return defaultSubSlugsByParent.get(parent)?.has(subSlug) ?? false;
}
