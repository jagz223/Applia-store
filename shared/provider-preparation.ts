/**
 * Campos de preparación del asociado (Firestore): `preparationLevel` es el nombre canónico;
 * `coursesCompleted` se mantiene por compatibilidad con datos antiguos.
 */
import { MAN_GO_CATEGORY_SLUG, normalizeProviderCategorySlug } from "./default-categories";

export const TRADE_LISTING_CATEGORY_SLUGS = new Set<string>([MAN_GO_CATEGORY_SLUG]);

export const PROFESSIONAL_CATEGORY_SLUG = "professional";

/** Las categorías de catálogo donde pueden publicarse credenciales (preparación y/o certificaciones). */
export const CATALOG_CREDENTIAL_CATEGORY_SLUGS = new Set<string>([
  PROFESSIONAL_CATEGORY_SLUG,
  ...TRADE_LISTING_CATEGORY_SLUGS,
]);

export function isCatalogCredentialCategorySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return CATALOG_CREDENTIAL_CATEGORY_SLUGS.has(normalizeProviderCategorySlug(slug));
}

export function resolvePreparationLevel(
  p: { preparationLevel?: string | null; coursesCompleted?: string | null } | null | undefined
): string {
  if (!p) return "";
  const raw = p.preparationLevel ?? p.coursesCompleted;
  return typeof raw === "string" ? raw.trim() : "";
}

export function resolveCertificationsText(
  p: { certifications?: string | null } | null | undefined
): string {
  if (!p) return "";
  const raw = p.certifications;
  return typeof raw === "string" ? raw.trim() : "";
}

export function isTradeListingCategorySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return TRADE_LISTING_CATEGORY_SLUGS.has(normalizeProviderCategorySlug(slug));
}

export function isProfessionalListingCategorySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return normalizeProviderCategorySlug(slug) === PROFESSIONAL_CATEGORY_SLUG;
}
