import {
  createServiceIsFocusCatalogSlug,
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
} from "./create-service-catalog-context";

/**
 * Campos opcionales persistidos en el documento del servicio (p. ej. Firestore).
 * Si no existen, la UI sigue mostrando la biografía/habilidades/etc. del proveedor (compatibilidad).
 */
export type ServiceListingProfileFields = {
  listingBio?: string | null;
  listingProfession?: string | null;
  listingYearsExperience?: number | null;
  listingSkills?: string[] | null;
  listingPreparationLevel?: string | null;
  listingCertifications?: string | null;
};

/** Mezcla perfil de proveedor con datos propios de la ficha de servicio (sin mutar el doc. del proveedor). */
export function mergeProviderWithServiceListingProfile<P extends Record<string, unknown>>(
  provider: P | undefined,
  service: Record<string, unknown>,
): P | undefined {
  if (!provider) return undefined;
  const merged = { ...provider } as Record<string, unknown>;

  if (typeof service.listingBio === "string") {
    merged.bio = service.listingBio;
  }
  if (typeof service.listingProfession === "string") {
    merged.profession = service.listingProfession;
  }
  if (typeof service.listingYearsExperience === "number" && Number.isFinite(service.listingYearsExperience)) {
    merged.yearsExperience = service.listingYearsExperience;
  }
  if (Array.isArray(service.listingSkills)) {
    merged.skills = service.listingSkills;
  }
  if (typeof service.listingPreparationLevel === "string") {
    merged.preparationLevel = service.listingPreparationLevel;
    merged.coursesCompleted = service.listingPreparationLevel;
  }
  if (typeof service.listingCertifications === "string") {
    merged.certifications = service.listingCertifications;
  }
  return merged as P;
}

export type CatalogServiceListingFormSnapshot = {
  yearsExperience: number;
  skills: string[];
  profession?: string;
  bio?: string;
  preparationLevel?: string;
  certifications?: string;
};

/** Payload `listing*` al crear un servicio de catálogo desde el formulario extendido. */
export function buildServiceListingProfileFromCreateForm(
  slug: string | undefined,
  data: CatalogServiceListingFormSnapshot,
): Partial<ServiceListingProfileFields> {
  if (!createServiceIsFocusCatalogSlug(slug)) return {};

  const out: Partial<ServiceListingProfileFields> = {
    listingYearsExperience: data.yearsExperience,
    listingSkills: data.skills ?? [],
  };

  if (isProfessionalListingCategorySlug(slug)) {
    out.listingProfession = (data.profession ?? "").trim();
    out.listingBio = (data.bio ?? "").trim();
    out.listingCertifications = (data.certifications ?? "").trim();
    return out;
  }

  if (isTradeListingCategorySlug(slug)) {
    out.listingPreparationLevel = (data.preparationLevel ?? "").trim();
    out.listingCertifications = (data.certifications ?? "").trim();
    const bioT = (data.bio ?? "").trim();
    if (bioT.length >= 50) out.listingBio = bioT;
    const profT = (data.profession ?? "").trim();
    if (profT.length >= 1) out.listingProfession = profT;
  }

  return out;
}
