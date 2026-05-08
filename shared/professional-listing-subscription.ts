import { addMonths, differenceInCalendarDays, startOfDay } from "date-fns";

/** Días antes del vencimiento en los que se muestra aviso fuerte de renovación. */
export const LISTING_SUBSCRIPTION_WARNING_DAYS = 10;

export function parseVisibilitySubscriptionEndMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof raw === "object" && raw !== null && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (raw as { toDate: () => Date }).toDate();
      const t = d instanceof Date ? d.getTime() : NaN;
      return Number.isNaN(t) ? null : t;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null && typeof (raw as { toMillis?: () => number }).toMillis === "function") {
    try {
      const t = (raw as { toMillis: () => number }).toMillis();
      return typeof t === "number" && !Number.isNaN(t) ? t : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Ventana de publicación vigente en catálogo.
 * Sin fecha = datos previos al cambio (sigue público hasta que el admin cargue ciclo mensual).
 */
export function isVisibilitySubscriptionWindowActive(endsAtRaw: unknown, nowMs: number = Date.now()): boolean {
  const endMs = parseVisibilitySubscriptionEndMs(endsAtRaw);
  if (endMs == null) return true;
  // Semántica por calendario: un "fin" en una fecha X se considera vigente durante todo ese día.
  const nowDay = startOfDay(new Date(nowMs));
  const endDay = startOfDay(new Date(endMs));
  return differenceInCalendarDays(endDay, nowDay) >= 0;
}

export function computeListingPublished(args: {
  isVerifiedIdentity: boolean;
  visibilitySubscriptionEndsAt: unknown;
  isFullAdmin: boolean;
  nowMs?: number;
}): boolean {
  const now = args.nowMs ?? Date.now();
  if (args.isFullAdmin) return true;
  if (!args.isVerifiedIdentity) return false;
  return isVisibilitySubscriptionWindowActive(args.visibilitySubscriptionEndsAt, now);
}

/**
 * Tras cada pago mensual USD 15 validado: +1 mes calendario desde max(ahora, fin actual).
 */
export function extendVisibilitySubscriptionEndsAt(prevEndsAtRaw: unknown, approvalAt: Date = new Date()): string {
  return extendVisibilitySubscriptionEndsAtByMonths(prevEndsAtRaw, 1, approvalAt);
}

/**
 * Tras pago validado: +N meses calendario desde max(ahora, fin actual).
 */
export function extendVisibilitySubscriptionEndsAtByMonths(
  prevEndsAtRaw: unknown,
  months: number,
  approvalAt: Date = new Date(),
): string {
  const prevMs = parseVisibilitySubscriptionEndMs(prevEndsAtRaw);
  const nowMs = approvalAt.getTime();
  const baseMs = prevMs != null && prevMs > nowMs ? prevMs : nowMs;
  const m = Number.isFinite(months) ? Math.max(1, Math.min(12, Math.trunc(months))) : 1;
  return addMonths(new Date(baseMs), m).toISOString();
}

export function listingSubscriptionDaysRemaining(endsAtRaw: unknown, nowMs: number = Date.now()): number | null {
  const endMs = parseVisibilitySubscriptionEndMs(endsAtRaw);
  if (endMs == null) return null;
  // Conteo por días de calendario (incluye "hoy" si aún es vigente).
  const nowDay = startOfDay(new Date(nowMs));
  const endDay = startOfDay(new Date(endMs));
  const diff = differenceInCalendarDays(endDay, nowDay);
  return diff >= 0 ? diff + 1 : 0;
}
