/**
 * Subcategorías por defecto del sistema.
 * Cada subcategoría está asociada a una categoría (por slug de la categoría).
 * Se usan en seed-subcategories; el seeder resuelve categorySlug → categoryId en Firestore.
 */
export const DEFAULT_SUBCATEGORIES: ReadonlyArray<{
  slug: string;
  name: string;
  categorySlug: string;
  icon?: string;
}> = [
  { slug: "legal", name: "Servicios Legales", categorySlug: "professional", icon: "Scale" },
  { slug: "financial", name: "Consultoría Financiera", categorySlug: "professional", icon: "TrendingUp" },
];
