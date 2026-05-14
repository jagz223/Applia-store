import { CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS } from "./catalog-service-categories";
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
  return raw.trim().toLowerCase();
}

export function isCatalogAssignableSlug(slug: string | undefined): boolean {
  const s = String(slug ?? "").trim().toLowerCase();
  return (CATALOG_ASSIGNABLE_SERVICE_CATEGORY_SLUGS as readonly string[]).includes(s);
}

/** Las tres categorías de catálogo donde un segundo servicio exige subcategoría (misma regla que Become Pro). */
export function createServiceRequiresSubcategory(slug: string | undefined): boolean {
  const s = String(slug ?? "").trim().toLowerCase();
  return s === "technical" || s === "maintenance" || s === "professional";
}

export function createServiceIsFocusCatalogSlug(slug: string | undefined): boolean {
  return createServiceRequiresSubcategory(slug);
}

export { isTradeListingCategorySlug, isProfessionalListingCategorySlug };

export function getCreateServiceCategoryIntro(slug: string | undefined): string | null {
  if (slug === "professional") {
    return "Para profesionales (abogados, contadores, psicólogos, asesores): describe tu oferta con un título claro, qué incluye y tu enfoque de trabajo.";
  }
  if (slug === "technical") {
    return "Para servicios técnicos (computación, electrónica, redes): aclara qué reparas o instalas, el alcance del trabajo y tus habilidades clave.";
  }
  if (slug === "maintenance") {
    return "Para mantenimiento (refrigeración, plomería, electricidad, aires): detalla el servicio, qué incluye y tu experiencia práctica.";
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
  if (slug === "professional") {
    return {
      profession: "Ej. Abogado, Contador, Psicólogo",
      serviceTitle: "Ej. Asesoría contable para emprendedores",
      serviceDescription:
        "Ej. Qué incluye: revisión, diagnóstico, entrega de documentos, tiempos estimados, alcance del acompañamiento.",
      bio: "Tu experiencia, tu enfoque (cómo trabajas), qué tipo de casos tomas y qué pueden esperar los clientes. 50–700 caracteres.",
    };
  }
  if (slug === "technical") {
    return {
      profession: "Ej. Técnico en computación, Técnico electrónico",
      serviceTitle: "Ej. Reparación de PC y laptops (diagnóstico + arreglo)",
      serviceDescription:
        "Ej. Qué incluye: diagnóstico, reparación, pruebas, instalación de software, tiempos de entrega, qué NO incluye.",
      bio: "Tu experiencia en equipos/marcas, cómo trabajas, garantías, tiempos y forma de diagnóstico. 50–700 caracteres.",
    };
  }
  if (slug === "maintenance") {
    return {
      profession: "Ej. Técnico en refrigeración, Plomero, Electricista",
      serviceTitle: "Ej. Mantenimiento preventivo de aires acondicionados",
      serviceDescription:
        "Ej. Qué incluye: limpieza, revisión, pruebas, materiales incluidos/no incluidos, duración aproximada.",
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
