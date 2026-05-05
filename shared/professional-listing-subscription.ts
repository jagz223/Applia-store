import { addMonths } from "date-fns";

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
  return nowMs < endMs;
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
  const prevMs = parseVisibilitySubscriptionEndMs(prevEndsAtRaw);
  const nowMs = approvalAt.getTime();
  const baseMs = prevMs != null && prevMs > nowMs ? prevMs : nowMs;
  return addMonths(new Date(baseMs), 1).toISOString();
}

export function listingSubscriptionDaysRemaining(endsAtRaw: unknown, nowMs: number = Date.now()): number | null {
  const endMs = parseVisibilitySubscriptionEndMs(endsAtRaw);
  if (endMs == null) return null;
  return Math.ceil((endMs - nowMs) / (24 * 60 * 60 * 1000));
}
