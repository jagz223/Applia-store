import type { PromotionalCodeRecord } from "./promotional-code-utils";
import {
  formatPromotionalCodeBenefit,
  formatPromotionalCodeTimeRemaining,
  isPromotionalCodeCurrentlyActive,
  parsePromotionalExpiresAt,
} from "./promotional-code-utils";

export type PublicPromoAdminEditRestrictions = {
  /** Aún dentro de los primeros 15 min desde la creación (código público). */
  initialWindowActive: boolean;
  /** Tras 15 min: el identificador del código ya no se puede cambiar. */
  codeNameLocked: boolean;
  /** Tras 15 min: solo beneficio (tipo y valor); expiración y visibilidad bloqueados. */
  onlyBenefitEditable: boolean;
};

export const NOTIFICATION_TYPE_PUBLIC_PROMO_NEW = "public_promo_new";
export const NOTIFICATION_TYPE_PUBLIC_PROMO_REMINDER = "public_promo_reminder";
export const NOTIFICATION_TYPE_PUBLIC_PROMO_ENDED = "public_promo_ended";

export type PublicPromoEndReason = "expired_time" | "exhausted_uses" | "deactivated";

export const PUBLIC_PROMOS_PAGE_URL = "/promociones";

/** Retraso tras crear un código público antes del aviso masivo (evita carreras al guardar). */
export const PUBLIC_PROMO_ANNOUNCE_DELAY_MS = 15 * 60 * 1000;

/** Misma ventana: edición completa del código público (incluido el nombre). */
export const PUBLIC_PROMO_INITIAL_EDIT_WINDOW_MS = PUBLIC_PROMO_ANNOUNCE_DELAY_MS;

export function getPublicPromoCreatedAtMs(
  row: Pick<PromotionalCodeRecord, "createdAt">,
): number | null {
  const d = parsePromotionalExpiresAt(row.createdAt);
  return d?.getTime() ?? null;
}

export function isWithinPublicPromoInitialEditWindow(
  row: Pick<PromotionalCodeRecord, "isPublic" | "createdAt">,
  nowMs: number = Date.now(),
): boolean {
  if (row.isPublic !== true) return true;
  const createdMs = getPublicPromoCreatedAtMs(row);
  if (createdMs == null) return false;
  return nowMs - createdMs < PUBLIC_PROMO_INITIAL_EDIT_WINDOW_MS;
}

export function isPublicPromoCodeNameLocked(
  row: Pick<PromotionalCodeRecord, "isPublic" | "createdAt">,
  nowMs: number = Date.now(),
): boolean {
  return row.isPublic === true && !isWithinPublicPromoInitialEditWindow(row, nowMs);
}

export function getPublicPromoAdminEditRestrictions(
  row: Pick<PromotionalCodeRecord, "isPublic" | "createdAt">,
  nowMs: number = Date.now(),
): PublicPromoAdminEditRestrictions {
  const initialWindowActive = isWithinPublicPromoInitialEditWindow(row, nowMs);
  const codeNameLocked = isPublicPromoCodeNameLocked(row, nowMs);
  return {
    initialWindowActive,
    codeNameLocked,
    onlyBenefitEditable: codeNameLocked,
  };
}

/** Texto de ayuda para el panel admin al marcar «código público». */
export const PUBLIC_PROMO_ADMIN_CREATE_HINT =
  "Si marcas «Código público»: a los 15 minutos se envían notificaciones a admins y asociados. " +
  "Durante los primeros 15 minutos puedes editar todo (nombre, expiración y beneficio). " +
  "Después de ese tiempo solo podrás cambiar el beneficio (descuento o meses); el nombre del código queda fijo. " +
  "Al vencer o agotarse, la promo deja de mostrarse en la vitrina; si alguien abre un aviso antiguo, la verá como expirada en Promociones.";

export function formatPublicPromoInitialWindowRemaining(
  row: Pick<PromotionalCodeRecord, "isPublic" | "createdAt">,
  nowMs: number = Date.now(),
): string | null {
  if (row.isPublic !== true) return null;
  const createdMs = getPublicPromoCreatedAtMs(row);
  if (createdMs == null) return null;
  const remainingMs = PUBLIC_PROMO_INITIAL_EDIT_WINDOW_MS - (nowMs - createdMs);
  if (remainingMs <= 0) return null;
  const totalMin = Math.ceil(remainingMs / 60_000);
  return totalMin === 1 ? "1 minuto" : `${totalMin} minutos`;
}

/** Intervalo entre recordatorios por usuario que no canjeó. */
export const PUBLIC_PROMO_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type PublicPromoUrgency = "calm" | "soon" | "urgent" | "critical";

export function getPublicPromoUrgency(
  row: Pick<PromotionalCodeRecord, "expirationType" | "expiresAt" | "maxUses" | "usedCount">,
  nowMs: number = Date.now(),
): PublicPromoUrgency {
  if (row.expirationType === "por_usos") {
    const max = row.maxUses ?? 0;
    const used = row.usedCount ?? 0;
    const remaining = Math.max(0, max - used);
    if (remaining <= 3) return "critical";
    if (remaining <= 10) return "urgent";
    return "calm";
  }

  const end = parsePromotionalExpiresAt(row.expiresAt);
  if (!end) return "calm";
  const diffMs = end.getTime() - nowMs;
  if (diffMs <= 0) return "critical";
  const hours = diffMs / (60 * 60 * 1000);
  if (hours < 24) return "critical";
  if (hours < 72) return "urgent";
  if (hours < 7 * 24) return "soon";
  return "calm";
}

/** Descripción legible del beneficio para la vitrina pública. */
export function describePublicPromotionalBenefit(
  row: Pick<PromotionalCodeRecord, "benefitType" | "benefitValue">,
): string {
  const value = parseFloat(String(row.benefitValue));
  if (!Number.isFinite(value)) return "Beneficio especial en tu suscripción";
  if (row.benefitType === "descuento") {
    return `${value}% de descuento en el pago de tu mensualidad`;
  }
  if (row.benefitType === "meses_gratuitos") {
    const n = Math.trunc(value);
    return n === 1 ? "1 mes gratis en tu suscripción" : `${n} meses gratis en tu suscripción`;
  }
  return `Beneficio: ${formatPromotionalCodeBenefit(row)}`;
}

export type PublicPromoExpiryBanner = {
  headline: string;
  subline?: string;
  tone: PublicPromoUrgency;
  isCountdown: boolean;
};

/** Mensaje llamativo de vigencia (más intenso cuanto menos tiempo quede). */
export function buildPublicPromoExpiryBanner(
  row: Pick<PromotionalCodeRecord, "expirationType" | "expiresAt" | "maxUses" | "usedCount">,
  nowMs: number = Date.now(),
): PublicPromoExpiryBanner {
  if (row.expirationType === "por_usos") {
    const max = row.maxUses ?? 0;
    const used = row.usedCount ?? 0;
    const remaining = Math.max(0, max - used);
    const urgency = getPublicPromoUrgency(row, nowMs);
    if (remaining <= 3) {
      return {
        headline: `¡Últimos ${remaining} cupos!`,
        subline: "Canjea tu código antes de que se agoten",
        tone: urgency,
        isCountdown: false,
      };
    }
    if (remaining <= 15) {
      return {
        headline: `Quedan ${remaining} usos disponibles`,
        subline: "No te quedes fuera de esta promo",
        tone: urgency,
        isCountdown: false,
      };
    }
    return {
      headline: "Promo activa por cupos limitados",
      subline: `${remaining} usos restantes de ${max}`,
      tone: "calm",
      isCountdown: false,
    };
  }

  const { primary, exactDate, expired, isCountdown } = formatPromotionalCodeTimeRemaining(
    row.expiresAt,
    nowMs,
  );
  const urgency = getPublicPromoUrgency(row, nowMs);

  if (expired) {
    return { headline: "Expiró", tone: "critical", isCountdown: false };
  }

  if (isCountdown) {
    return {
      headline: `¡Corre! Termina en ${primary}`,
      subline: `Válido hasta ${exactDate}`,
      tone: "critical",
      isCountdown: true,
    };
  }

  if (urgency === "critical") {
    return {
      headline: `¡Últimas horas! Quedan ${primary}`,
      subline: `Canjea antes del ${exactDate}`,
      tone: "critical",
      isCountdown: false,
    };
  }

  if (urgency === "urgent") {
    return {
      headline: `¡Se acaba pronto! ${primary} restantes`,
      subline: `Válido hasta ${exactDate}`,
      tone: "urgent",
      isCountdown: false,
    };
  }

  if (urgency === "soon") {
    return {
      headline: `Aprovecha: ${primary} para usar tu código`,
      subline: `Vence el ${exactDate}`,
      tone: "soon",
      isCountdown: false,
    };
  }

  return {
    headline: `Tienes ${primary} para canjearlo`,
    subline: `Válido hasta ${exactDate}`,
    tone: "calm",
    isCountdown: false,
  };
}

export function buildPublicPromoNewPushCopy(): { title: string; body: string } {
  return {
    title: "¡Nueva promo en GenFeb!",
    body: "Hay un código promocional disponible — entra a Promociones para verlo y canjearlo antes de que expire.",
  };
}

export function buildPublicPromoReminderPushCopy(
  row: Pick<PromotionalCodeRecord, "code" | "expirationType" | "expiresAt" | "maxUses" | "usedCount" | "benefitType" | "benefitValue">,
  nowMs: number = Date.now(),
): { title: string; body: string } {
  const urgency = getPublicPromoUrgency(row, nowMs);
  const benefit = describePublicPromotionalBenefit(row);

  if (urgency === "critical") {
    return {
      title: "¡Último llamado! Tu promo sigue activa",
      body: `Una promo (${benefit}) está por vencer. Entra a Promociones para ver el código y canjearla.`,
    };
  }
  if (urgency === "urgent") {
    return {
      title: "¡Esta promo se acaba pronto!",
      body: `Sigue disponible (${benefit}). Abre Promociones para ver el código y usarla.`,
    };
  }
  return {
    title: "Tu promo sigue activa",
    body: `Recuerda canjearla (${benefit}). El detalle te espera en Promociones.`,
  };
}

export function filterActivePublicPromotionalCodes(
  codes: readonly PromotionalCodeRecord[],
  nowMs: number = Date.now(),
): PromotionalCodeRecord[] {
  return codes.filter((c) => c.isPublic === true && isPromotionalCodeCurrentlyActive(c, nowMs));
}

/** Motivo por el que un código público ya no está activo (null si sigue vigente). */
export function getPublicPromoEndReason(
  row: PromotionalCodeRecord,
  nowMs: number = Date.now(),
): PublicPromoEndReason | null {
  if (row.isPublic !== true) return null;
  if (isPromotionalCodeCurrentlyActive(row, nowMs)) return null;
  if (row.isActive === false) return "deactivated";

  if (row.expirationType === "por_usos") {
    const max = row.maxUses ?? 0;
    const used = row.usedCount ?? 0;
    if (max >= 1 && used >= max) return "exhausted_uses";
  }

  if (row.expirationType === "por_tiempo") {
    const end = parsePromotionalExpiresAt(row.expiresAt);
    if (end && nowMs > end.getTime()) return "expired_time";
  }

  return "deactivated";
}

/** Banner para la vitrina cuando el usuario abre una promo ya vencida (p. ej. desde notificación antigua). */
export function buildPublicPromoExpiredDisplayBanner(
  reason: PublicPromoEndReason,
): PublicPromoExpiryBanner {
  if (reason === "exhausted_uses") {
    return {
      headline: "Ya expiró",
      subline: "Se agotaron los cupos de esta promoción.",
      tone: "calm",
      isCountdown: false,
    };
  }
  if (reason === "expired_time") {
    return {
      headline: "Ya expiró",
      subline: "Esta promoción venció y ya no se puede canjear.",
      tone: "calm",
      isCountdown: false,
    };
  }
  return {
    headline: "Ya no está disponible",
    subline: "Esta promoción fue dada de baja.",
    tone: "calm",
    isCountdown: false,
  };
}

/** @deprecated Ya no se envían notificaciones de cierre; solo vitrina opaca en /promociones. */
export function buildPublicPromoEndedNotificationCopy(
  _row: Pick<PromotionalCodeRecord, "code">,
  reason: PublicPromoEndReason,
): { title: string; body: string } {
  if (reason === "exhausted_uses") {
    return {
      title: "Una promo agotó sus cupos",
      body: "Ya no está disponible. Entra a Promociones para ver si hay otra activa.",
    };
  }

  if (reason === "expired_time") {
    return {
      title: "Una promo ya venció",
      body: "Entra a Promociones para ver las promociones que siguen activas.",
    };
  }

  return {
    title: "Una promo ya no está disponible",
    body: "Entra a Promociones para descubrir otras oportunidades.",
  };
}
