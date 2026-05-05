/**
 * Subcategorías por defecto del sistema.
 * Cada subcategoría está asociada a una categoría (por slug de la categoría).
 * Se usan en seed-subcategories; el seeder resuelve categorySlug → categoryId en Firestore.
 *
 * - Pro Go (`professional`): Servicios Legales, Consultoría Financiera, Tutorías.
 * - Fix Go (`technical`): plomería, electricidad, electrodomésticos, cerrajería, computación.
 * - Man Go (`maintenance`): limpieza, aires, jardinería, pintura.
 * - Car Go (`transport`): tipo de vehículo (moto, auto, etc.).
 */
export const DEFAULT_SUBCATEGORIES: ReadonlyArray<{
  slug: string;
  name: string;
  categorySlug: string;
  icon?: string;
}> = [
  /** ——— Pro Go ——— */
  { slug: "legal", name: "Servicios Legales", categorySlug: "professional", icon: "Scale" },
  { slug: "financial", name: "Consultoría Financiera", categorySlug: "professional", icon: "TrendingUp" },
  { slug: "tutoring", name: "Tutorías", categorySlug: "professional", icon: "GraduationCap" },

  /** ——— Fix Go (Servicios Técnicos) ——— */
  { slug: "plumbing", name: "Plomería", categorySlug: "technical", icon: "Droplets" },
  { slug: "electrical", name: "Electricidad", categorySlug: "technical", icon: "Zap" },
  { slug: "appliances", name: "Reparación de Electrodomésticos", categorySlug: "technical", icon: "Microwave" },
  { slug: "locksmith", name: "Cerrajería", categorySlug: "technical", icon: "KeyRound" },
  { slug: "computing", name: "Computación / Electrónica", categorySlug: "technical", icon: "Cpu" },

  /** ——— Man Go (Mantenimiento) ——— */
  { slug: "cleaning", name: "Limpieza", categorySlug: "maintenance", icon: "Sparkles" },
  { slug: "ac_maintenance", name: "Mantenimiento de Aires Acondicionados", categorySlug: "maintenance", icon: "Wind" },
  { slug: "gardening", name: "Jardinería", categorySlug: "maintenance", icon: "Trees" },
  { slug: "painting", name: "Pintura", categorySlug: "maintenance", icon: "Paintbrush" },

  /** Car Go (`transport`): tipo de vehículo */
  { slug: "moto", name: "Moto", categorySlug: "transport", icon: "Bike" },
  { slug: "auto", name: "Auto", categorySlug: "transport", icon: "Car" },
  { slug: "camioneta", name: "Camioneta", categorySlug: "transport", icon: "Truck" },
  { slug: "truck", name: "Camión", categorySlug: "transport", icon: "Construction" },
];
