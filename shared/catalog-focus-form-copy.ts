/**
 * Textos del formulario de catálogo (técnico / mantenimiento / profesional).
 * Fuente única para alinear «Agregar servicio» con Become Pro (misma redacción).
 */

export const CATALOG_FOCUS_PREPARATION_LEVEL_DESCRIPTION =
  "Incluye tu escolaridad o nivel formal alcanzado (por ejemplo, primaria, bachillerato, técnico, universitario) y la formación complementaria: cursos, talleres o programas en Servicios técnicos o Mantenimiento. Se mostrará en la ficha pública del servicio en la sección «Nivel de preparación» y podrás editarlo después en «Editar servicio».";

export const CATALOG_FOCUS_CERTIFICATIONS_TRADE_DESCRIPTION =
  "Títulos, diplomas, maestrías, doctorados, carnés o certificados que respalden tu trabajo. Si solo tienes formación en cursos, puedes dejarlo vacío: no se mostrará ninguna sección de certificaciones hasta que lo completes aquí o en «Editar servicio».";

export const CATALOG_FOCUS_SERVICE_TITLE_DESCRIPTION =
  "Título público de tu servicio en el catálogo (editable después en «Editar servicio»).";

export const CATALOG_FOCUS_SERVICE_DESCRIPTION_OPTIONAL_NOTE =
  "Opcional: si no escribes nada aquí, el texto de tu biografía (más abajo) se usará como descripción inicial de tu oferta cuando estés verificado (luego puedes separarlos en «Editar servicio»).";

export const CATALOG_FOCUS_BIO_DESCRIPTION =
  "Quién eres y cómo trabajas. Si arriba no pusiste descripción del servicio, este texto se usará como descripción inicial de tu oferta cuando estés verificado (luego puedes separarlos en «Editar servicio»).";

export const CATALOG_FOCUS_CERTIFICATIONS_PROFESSIONAL_DESCRIPTION =
  "Maestrías, doctorados, registro profesional, títulos universitarios o certificaciones sectoriales.";

export function catalogFocusSubcategoryFormDescription(needsSubcategory: boolean): string {
  return needsSubcategory
    ? "Elige tu especialidad según la categoría (por ejemplo en Servicios Técnicos, Mantenimiento o Servicios Profesionales)."
    : "Afina tu perfil en el catálogo si aplica.";
}

/** Aviso en «Agregar servicio»: todo queda separado de tus otras ofertas (lenguaje claro, sin tecnicismos). */
export const CATALOG_CREATE_SERVICE_ISOLATION_NOTE =
  "Lo que guardes aquí es solo para esta oferta: no cambia el título ni el texto de tus otros servicios. Tampoco se mezclan tu biografía, tus habilidades, los años de experiencia ni lo que indiques de profesión o certificaciones con lo que ya tenías publicado: cada servicio es por su lado.";
