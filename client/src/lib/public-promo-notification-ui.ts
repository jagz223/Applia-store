import {
  NOTIFICATION_TYPE_PUBLIC_PROMO_ENDED,
  NOTIFICATION_TYPE_PUBLIC_PROMO_NEW,
  NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER,
  PUBLIC_PROMOS_PAGE_URL,
  buildPublicPromoNewPushCopy,
} from "@shared/public-promotional-notifications";

export const PUBLIC_PROMO_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE_PUBLIC_PROMO_NEW,
  NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER,
  NOTIFICATION_TYPE_PUBLIC_PROMO_ENDED,
] as const;

export function isPublicPromoNotificationType(type: string): boolean {
  return (PUBLIC_PROMO_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** No mostrar en campana/historial avisos de promo vencida (legacy). */
export function isPublicPromoEndedNotificationType(type: string): boolean {
  return type === NOTIFICATION_TYPE_PUBLIC_PROMO_ENDED;
}

export function shouldShowPublicPromoInNotificationList(type: string): boolean {
  return isPublicPromoNotificationType(type) && !isPublicPromoEndedNotificationType(type);
}

export function getPublicPromoNotificationPath(data?: Record<string, unknown> | null): string {
  const nested = (data?.data ?? {}) as Record<string, unknown>;
  const url = data?.url ?? nested.url;
  if (typeof url === "string" && url.startsWith("/")) return url;

  const promoId = data?.promoId ?? nested.promoId;
  if (promoId != null && String(promoId).trim() !== "") {
    return `${PUBLIC_PROMOS_PAGE_URL}?promo=${encodeURIComponent(String(promoId))}`;
  }
  return PUBLIC_PROMOS_PAGE_URL;
}

/** Textos in-app sin revelar el código; el detalle está en Promociones. */
export function getPublicPromoNotificationTitle(type: string, _data?: Record<string, unknown> | null): string {
  switch (type) {
    case NOTIFICATION_TYPE_PUBLIC_PROMO_NEW:
      return buildPublicPromoNewPushCopy().title;
    case NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER:
      return "Recuerda tu promo activa";
    default:
      return "Promoción GenFeb";
  }
}

export function getPublicPromoNotificationDescription(type: string, _data?: Record<string, unknown> | null): string {
  switch (type) {
    case NOTIFICATION_TYPE_PUBLIC_PROMO_NEW:
      return buildPublicPromoNewPushCopy().body;
    case NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER:
      return "Tienes una promo sin canjear. Entra a Promociones para ver el código y el beneficio.";
    default:
      return "Entra a Promociones para ver el detalle.";
  }
}

export const PUBLIC_PROMO_NOTIFICATION_CTA = "Ver promociones →";
