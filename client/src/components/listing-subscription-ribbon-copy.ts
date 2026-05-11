/** Textos del ribbon de suscripción de listado: compacto (móvil) vs detallado (sm+). */

export function expiredListingBannerCopy(): { short: string; long: string } {
  return {
    short: "Catálogo inactivo: venció la cuota USD 15. Subí comprobante para volver visible.",
    long: "Tu servicio ya no aparece en el explorador público: venció la cuota mensual de visibilidad (USD 15). Subí el comprobante para que un administrador la valide y recuperes la publicación.",
  };
}

export function criticalListingBannerCopy(days: number, endLabel: string): { short: string; long: string } {
  return {
    short: `Quedan ${days} día(s) · vence ${endLabel}. Renová USD 15.`,
    long: `Quedan ${days} día(s) para que expire tu visibilidad (hasta ${endLabel}). Renová ahora para evitar quedar fuera del catálogo.`,
  };
}

export function urgentListingBannerHeadline(days: number, endLabel: string): string {
  return `Te quedan ${days} día(s) de publicación (hasta ${endLabel}).`;
}

export const urgentListingDriverDetail =
  "Para poder trabajar como driver sin interrupciones, mantén tu suscripción al día. El costo se renueva cada mes y se valida por el equipo.";

export const urgentListingDriverDetailShort = "Como driver: renová USD 15 a tiempo para no perder habilitación.";

export const urgentListingDefaultDetail =
  "Mantén tu servicio visible en el catálogo con la suscripción mensual. Si renovás antes de que venza, al validarlo se suma un mes desde tu vencimiento actual.";

export const urgentListingDefaultDetailShort = "Renová USD 15 antes del vencimiento para seguir visible en el catálogo.";
