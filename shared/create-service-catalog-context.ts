import { CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS } from "./catalog-service-categories";
import { MAN_GO_CATEGORY_SLUG, normalizeProviderCategorySlug } from "./default-categories";
import {
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
} from "./provider-preparation";

export type CategoryWithSlug = { id: number; slug?: string | null };

export function createServiceCategorySlug(
  categoryId: number | undefined,
  categories: readonly CategoryWithSlug[],
): string | undefined {
  if (categoryId == null || !Number.isFinite(Number(categoryId)) || Number(categoryId) <= 0) {
    return undefined;
  }
  const row = categories.find((c) => Number(c.id) === Number(categoryId));
  const raw = row?.slug;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return normalizeProviderCategorySlug(raw);
}

export function isCatalogAssignableSlug(slug: string | undefined): boolean {
  const s = normalizeProviderCategorySlug(slug);
  return (CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS as readonly string[]).includes(s);
}

/** Categorías de catálogo donde un segundo servicio exige subcategoría (misma regla que Become Pro). */
export function createServiceRequiresSubcategory(slug: string | undefined): boolean {
  const s = normalizeProviderCategorySlug(slug);
  return s === MAN_GO_CATEGORY_SLUG || s === "professional";
}

export function createServiceIsFocusCatalogSlug(slug: string | undefined): boolean {
  return createServiceRequiresSubcategory(slug);
}

export { isTradeListingCategorySlug, isProfessionalListingCategorySlug };

export function getCreateServiceCategoryIntro(slug: string | undefined): string | null {
  const s = normalizeProviderCategorySlug(slug);
  if (s === "professional") {
    return "Para profesionales (abogados, contadores, psicólogos, asesores): describe tu oferta con un título claro, qué incluye y tu enfoque de trabajo.";
  }
  if (s === MAN_GO_CATEGORY_SLUG) {
    return "Para Man Go (técnicos, mantenimiento, oficios): detalla qué reparas o instalas, el alcance del trabajo y tu experiencia práctica.";
  }
  return null;
}

/** Placeholders alineados con Become Pro (`contextualPlaceholders`). */
export type CreateServiceFormPlaceholders = {
  profession: string;
  serviceTitle: string;
  serviceDescription: string;
  bio: string;
};

export function getCreateServiceFormPlaceholders(slug: string | undefined): CreateServiceFormPlaceholders {
  const s = normalizeProviderCategorySlug(slug);
  if (s === "professional") {
    return {
      profession: "Ej. Abogado, Contador, Psicólogo",
      serviceTitle: "Ej. Asesoría contable para emprendedores",
      serviceDescription:
        "Ej. Qué incluye: revisión, diagnóstico, entrega de documentos, tiempos estimados, alcance del acompañamiento.",
      bio: "Tu experiencia, tu enfoque (cómo trabajas), qué tipo de casos tomas y qué pueden esperar los clientes. 50–700 caracteres.",
    };
  }
  if (s === MAN_GO_CATEGORY_SLUG) {
    return {
      profession: "Ej. Técnico en refrigeración, Plomero, Técnico electrónico",
      serviceTitle: "Ej. Reparación de PC o mantenimiento de aires acondicionados",
      serviceDescription:
        "Ej. Qué incluye: diagnóstico, reparación, materiales incluidos/no incluidos, duración aproximada.",
      bio: "Tu experiencia, zonas, tipo de trabajos, materiales/herramientas y tu forma de trabajo. 50–700 caracteres.",
    };
  }
  return {
    profession: "Ej. Plomero, Diseñador gráfico",
    serviceTitle: "Ej. Asesoría legal laboral para PYMEs",
    serviceDescription: "Qué incluye esta oferta: alcance, entregables, duración o lo que cubre el precio.",
    bio: "Quién eres, tu especialidad, cómo trabajas y qué pueden esperar los clientes. Entre 50 y 700 caracteres.",
  };
}
