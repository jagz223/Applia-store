/**
 * Categorías de proveedor permitidas en el sistema.
 * La categoría del proveedor solo puede ser una de esta lista.
 * Usado para validación en API y en front (registro/edición).
 */
import { z } from "zod";

export const PROVIDER_CATEGORY_CODES = [
  "technical",      // Servicios Técnicos → Ingeniero Civil
  "legal",          // Servicios Legales → Abogado/a Corporativo/a
  "financial",     // Consultoría Financiera → Asesor Financiero
  "maintenance",    // Mantenimiento
  "delivery",       // Delivery
  "marketplace",    // Marketplace
  "transport",      // Servicios de transporte (Taxi)
] as const;

export type ProviderCategoryCode = (typeof PROVIDER_CATEGORY_CODES)[number];

/** Lista para UI y APIs: código + etiqueta + profesión asociada (si aplica) */
export const PROVIDER_CATEGORIES: ReadonlyArray<{
  code: ProviderCategoryCode;
  label: string;
  professionLabel?: string;
}> = [
  { code: "technical", label: "Servicios Técnicos", professionLabel: "Ingeniero Civil" },
  { code: "legal", label: "Servicios Legales", professionLabel: "Abogado/a Corporativo/a" },
  { code: "financial", label: "Consultoría Financiera", professionLabel: "Asesor Financiero" },
  { code: "maintenance", label: "Mantenimiento" },
  { code: "delivery", label: "Delivery" },
  { code: "marketplace", label: "Marketplace" },
  { code: "transport", label: "Servicios de transporte (Taxi)" },
];

export const providerCategorySchema = z.enum(PROVIDER_CATEGORY_CODES);

export function isValidProviderCategory(value: string): value is ProviderCategoryCode {
  return PROVIDER_CATEGORY_CODES.includes(value as ProviderCategoryCode);
}
