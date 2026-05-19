/** Textos del ribbon de suscripción de listado: compacto (móvil) vs detallado (sm+). Español neutro. */

export function expiredListingBannerCopy(monthlyUsdLabel: string): { short: string; long: string } {
  return {
    short: `Catálogo inactivo: venció la cuota ${monthlyUsdLabel}. Envía el comprobante para volver a ser visible.`,
    long: `Tu servicio ya no aparece en el explorador público: venció la cuota mensual de visibilidad (${monthlyUsdLabel}). Envía el comprobante para que un administrador lo valide y recuperes la publicación.`,
  };
}

export function criticalListingBannerCopy(
  days: number,
  endLabel: string,
  monthlyUsdLabel: string,
): { short: string; long: string } {
  return {
    short: `Quedan ${days} día(s) · vence ${endLabel}. Renueva ${monthlyUsdLabel}.`,
    long: `Quedan ${days} día(s) para que expire tu visibilidad (hasta ${endLabel}). Renueva ahora para evitar quedar fuera del catálogo.`,
  };
}

export function urgentListingBannerHeadline(days: number, endLabel: string): string {
  return `Te quedan ${days} día(s) de publicación (hasta ${endLabel}).`;
}

export const urgentListingDriverDetail =
  "Para poder trabajar como conductor sin interrupciones, mantén tu suscripción al día. El costo se renueva cada mes y lo valida el equipo.";

export function urgentListingDriverDetailShort(monthlyUsdLabel: string): string {
  return `Como conductor: renueva ${monthlyUsdLabel} a tiempo para no perder la habilitación.`;
}

export const urgentListingDefaultDetail =
  "Mantén tu servicio visible en el catálogo con la suscripción mensual. Si renuevas antes de que venza, al validarlo se suma un mes desde tu vencimiento actual.";

export function urgentListingDefaultDetailShort(monthlyUsdLabel: string): string {
  return `Renueva ${monthlyUsdLabel} antes del vencimiento para seguir visible en el catálogo.`;
}

/** @deprecated Usar {@link EDIT_SERVICE_SUBSCRIPTION_LOCKED_BANNER} en `@shared/provider-listing-owner-messages`. */
export { EDIT_SERVICE_SUBSCRIPTION_LOCKED_BANNER as listingUnpublishedEditBannerCopy } from "@shared/provider-listing-owner-messages";

/** Ficha conductor en Mis servicios (Genfeb Go). */
export const goMobilitySubscriptionInactiveCta =
  "Activa tu suscripción para poder recibir servicios de movilidad (taxi y delivery).";
