/**
 * Subcategorías por defecto del sistema.
 * Cada subcategoría está asociada a una categoría (por slug de la categoría).
 * Se usan en seed-subcategories; el seeder resuelve categorySlug → categoryId en Firestore.
 * Incluye subcategorías de Car Go (categoría `transport`): moto, auto, camioneta.
 */
export const DEFAULT_SUBCATEGORIES: ReadonlyArray<{
  slug: string;
  name: string;
  categorySlug: string;
  icon?: string;
}> = [
  { slug: "legal", name: "Servicios Legales", categorySlug: "professional", icon: "Scale" },
  { slug: "financial", name: "Consultoría Financiera", categorySlug: "professional", icon: "TrendingUp" },
  /** Car Go (`transport`): tipo de vehículo */
  { slug: "moto", name: "Moto", categorySlug: "transport", icon: "Bike" },
  { slug: "auto", name: "Auto", categorySlug: "transport", icon: "Car" },
  { slug: "camioneta", name: "Camioneta", categorySlug: "transport", icon: "Truck" },
  { slug: "truck", name: "Camión", categorySlug: "transport", icon: "Construction" },
];
