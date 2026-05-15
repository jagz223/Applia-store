/**
 * Categorías de proveedor permitidas en el sistema.
 * La categoría del proveedor solo puede ser una de esta lista.
 * Usado para validación en API y en front (registro/edición).
 */
import { z } from "zod";
import { isRetiredProviderCategorySlug, normalizeProviderCategorySlug } from "./default-categories";

export const PROVIDER_CATEGORY_CODES = [
  "technical",
  "professional",
  "delivery",
  "marketplace",
  "transport",
] as const;

export type ProviderCategoryCode = (typeof PROVIDER_CATEGORY_CODES)[number];

/** Lista para UI y APIs: código + etiqueta + profesión asociada (si aplica) */
export const PROVIDER_CATEGORIES: ReadonlyArray<{
  code: ProviderCategoryCode;
  label: string;
  professionLabel?: string;
}> = [
  { code: "technical", label: "Man Go", professionLabel: "Ingeniero Civil" },
  { code: "professional", label: "Servicios Profesionales" },
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
  const normalized = normalizeProviderCategorySlug(value);
  if (isRetiredProviderCategorySlug(normalized)) return false;
  return PROVIDER_CATEGORY_CODES.includes(normalized as ProviderCategoryCode);
}
