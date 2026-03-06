/**
 * Categorías por defecto del sistema (único sistema para servicios y proveedores).
 * Se usan en seed y en migración. Slug = identificador único para mapear provider.category (string) → categoryId.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  slug: string;
  name: string;
  type: string;
  icon: string;
  imageUrl?: string;
}> = [
  { slug: "technical", name: "Servicios Técnicos", type: "technical", icon: "Wrench" },
  { slug: "legal", name: "Servicios Legales", type: "legal", icon: "Scale" },
  { slug: "financial", name: "Consultoría Financiera", type: "profession", icon: "TrendingUp" },
  { slug: "maintenance", name: "Mantenimiento", type: "technical", icon: "Home" },
  { slug: "delivery", name: "Delivery", type: "technical", icon: "Package" },
  { slug: "marketplace", name: "Marketplace", type: "technical", icon: "Store" },
  { slug: "transport", name: "Servicios de transporte (Taxi)", type: "technical", icon: "Car" },
];
