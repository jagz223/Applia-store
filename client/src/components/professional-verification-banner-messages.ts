import { providerHasGoBrand } from "@shared/provider-go";
import type { ProviderGoRef } from "@shared/provider-go";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";

export type VerificationBannerKind = "transport" | "delivery" | "mobility_both" | "other";

type CategorySlugRow = { id: number; slug?: string | null };

/**
 * Taxi/movilidad vs delivery vs catálogo genérico (según categoría y `goBrands`).
 */
export function getVerificationBannerKind(
  provider: ProviderGoRef | null | undefined,
  categories: readonly CategorySlugRow[]
): VerificationBannerKind {
  const hasTransport = providerHasGoBrand(provider, "transport", categories);
  const hasDelivery = providerHasGoBrand(provider, "delivery", categories);
  if (hasTransport && hasDelivery) return "mobility_both";
  if (hasTransport) return "transport";
  if (hasDelivery) return "delivery";
  return "other";
}

type BannerCopy = { compact: string; full: string };

/** En revisión: mismo matiz por tipo de servicio. */
export const VERIFICATION_IN_REVIEW_BY_KIND: Record<VerificationBannerKind, BannerCopy> = {
  transport: {
    compact: "Verificación en revisión. Te avisamos al aprobar.",
    full: `Tu solicitud está en revisión. Cuando sea aprobada, podrás tomar ${MOBILITY_UI.taxiService.toLowerCase()} con normalidad.`,
  },
  delivery: {
    compact: "Verificación en revisión. Te avisamos al aprobar.",
    full: `Tu solicitud está en revisión. Cuando sea aprobada, podrás tomar pedidos de ${MOBILITY_UI.delivery.toLowerCase()} con normalidad.`,
  },
  mobility_both: {
    compact: "Verificación en revisión. Te avisamos al aprobar.",
    full: `Tu solicitud está en revisión. Cuando sea aprobada, podrás operar en ${MOBILITY_UI.taxiService.toLowerCase()} y ${MOBILITY_UI.delivery.toLowerCase()} con normalidad.`,
  },
  other: {
    compact: "Verificación en revisión. Te avisamos al aprobar.",
    full: "Tu solicitud de verificación está en revisión. Cuando sea aprobada, tu servicio podrá mostrarse con normalidad en el sitio.",
  },
};

/** Pendiente de envío / no verificado aún. */
export const VERIFICATION_PENDING_BY_KIND: Record<VerificationBannerKind, BannerCopy> = {
  transport: {
    compact: `Sin verificación no podés tomar ${MOBILITY_UI.taxiService.toLowerCase()}.`,
    full: `Aún no estás verificado; no podrás tomar viajes ni solicitudes de ${MOBILITY_UI.taxiService.toLowerCase()} hasta completar la verificación.`,
  },
  delivery: {
    compact: `Sin verificación no podés tomar ${MOBILITY_UI.delivery.toLowerCase()}.`,
    full: `Aún no estás verificado; no podrás tomar pedidos de ${MOBILITY_UI.delivery.toLowerCase()} hasta completar la verificación.`,
  },
  mobility_both: {
    compact: "Sin verificación no podés operar en taxi ni delivery.",
    full: `Aún no estás verificado; no podrás tomar viajes de ${MOBILITY_UI.taxiService.toLowerCase()} ni pedidos de ${MOBILITY_UI.delivery.toLowerCase()} hasta completar la verificación.`,
  },
  other: {
    compact: "Tu servicio no es visible sin verificación.",
    full: "Aún no estás verificado; tu servicio no aparecerá para los clientes en el catálogo hasta completar la verificación.",
  },
};
