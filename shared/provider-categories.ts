/**
 * Categorías de proveedor permitidas en el sistema.
 * La categoría del proveedor solo puede ser una de esta lista.
 * Usado para validación en API y en front (registro/edición).
 */
import { z } from "zod";

export const PROVIDER_CATEGORY_CODES = [
  "technical",      // Servicios Técnicos → Ingeniero Civil
  "professional",   // Servicios Profesionales (subcategorías: legales, consultoría financiera)
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
  { code: "professional", label: "Servicios Profesionales" },
  { code: "maintenance", label: "Mantenimiento" },
  { code: "delivery", label: "Delivery" },
  { code: "marketplace", label: "Marketplace" },
  { code: "transport", label: "Servicios de transporte (Taxi)" },
];

/** Subcategorías: pertenecen a la categoría "professional". Usar para proveedores de servicios legales o financieros. */
export const SUB_PROVIDER_CATEGORY_CODES = ["legal", "financial"] as const;
export type SubProviderCategoryCode = (typeof SUB_PROVIDER_CATEGORY_CODES)[number];

export const SUB_PROVIDER_CATEGORIES: ReadonlyArray<{
  code: SubProviderCategoryCode;
  label: string;
  professionLabel: string;
  parentCategoryCode: "professional";
}> = [
  { code: "legal", label: "Servicios Legales", professionLabel: "Abogado/a Corporativo/a", parentCategoryCode: "professional" },
  { code: "financial", label: "Consultoría Financiera", professionLabel: "Asesor Financiero", parentCategoryCode: "professional" },
];

export const providerCategorySchema = z.enum(PROVIDER_CATEGORY_CODES);

export function isValidProviderCategory(value: string): value is ProviderCategoryCode {
  return PROVIDER_CATEGORY_CODES.includes(value as ProviderCategoryCode);
}
