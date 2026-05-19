import type { PromotionalCodeBenefitType, PromotionalCodeExpirationType } from "./promotional-code-schema";

export type PromotionalCodeRecord = {
  id: number;
  code: string;
  expirationType: PromotionalCodeExpirationType | string;
  expiresAt?: Date | string | null;
  maxUses?: number | null;
  usedCount?: number | null;
  usedByUserCounts?: Record<string, number> | null;
  benefitType: PromotionalCodeBenefitType | string;
  benefitValue: string | number;
  isActive?: boolean | null;
};

/** Un canje por cuenta (regla fija del producto). */
export const PROMOTIONAL_CODE_MAX_USES_PER_USER = 1;

/** El usuario ya aplicó este código en su cuenta. */
export const PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER =
  "Ya canjeaste este código. Cada ticket o promoción solo puede usarse una vez en tu cuenta.";

/** Código agotado o fuera de vigencia (sin indicar si fue por tiempo o por cupos globales). */
export const PROMO_CODE_MSG_NO_LONGER_AVAILABLE = "Este código ya no está disponible.";

export function userHasRedeemedPromotionalCode(
  usedByUserCounts: Record<string, number> | null | undefined,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  const n = usedByUserCounts?.[String(userId)] ?? 0;
  return n >= PROMOTIONAL_CODE_MAX_USES_PER_USER;
}

/** Etiqueta legible del beneficio para tablas admin. */
export function formatPromotionalCodeBenefit(row: Pick<PromotionalCodeRecord, "benefitType" | "benefitValue">): string {
  const value = parseFloat(String(row.benefitValue));
  if (!Number.isFinite(value)) return "—";
  if (row.benefitType === "descuento") return `${value}%`;
  if (row.benefitType === "meses_gratuitos") return `${value} meses`;
  return String(row.benefitValue);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PROMOTIONAL_EXPIRY_COUNTDOWN_MS = MS_PER_DAY;

/** Convierte fecha de API/Firestore (ISO, Date, Timestamp) a Date válida o null. */
export function parsePromotionalExpiresAt(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { toDate?: () => Date; toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof o.toMillis === "function") {
      const d = new Date(o.toMillis());
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const sec = o._seconds ?? o.seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      const d = new Date(sec * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/** Fecha y hora de expiración legibles (es-EC, 12 h con a. m. / p. m.). */
export function formatPromotionalExpiresAtDisplay(date: Date): string {
  return date.toLocaleString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatExactDateEs(date: Date): string {
  return formatPromotionalExpiresAtDisplay(date);
}

export function getPromotionalExpiresTimeParts(date: Date): {
  hour12: number;
  minute: number;
  isPm: boolean;
} {
  const h24 = date.getHours();
  const isPm = h24 >= 12;
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: date.getMinutes(), isPm };
}

/** Aplica hora en formato 12 h sobre la fecha del calendario (conserva año/mes/día local). */
export function applyPromotionalExpiresTime(
  datePart: Date,
  hour12: number,
  minute: number,
  isPm: boolean,
): Date {
  const d = new Date(datePart);
  const h = Math.min(12, Math.max(1, Math.floor(hour12)));
  const m = Math.min(59, Math.max(0, Math.floor(minute)));
  let h24: number;
  if (h === 12) {
    h24 = isPm ? 12 : 0;
  } else {
    h24 = isPm ? h + 12 : h;
  }
  d.setHours(h24, m, 0, 0);
  return d;
}

/** Al elegir un día en el calendario, conserva la hora previa o usa fin de día (11:59 p. m.). */
export function mergePromotionalExpiresCalendarDay(
  selectedDay: Date,
  previous?: Date | null,
): Date {
  if (previous) {
    const { hour12, minute, isPm } = getPromotionalExpiresTimeParts(previous);
    return applyPromotionalExpiresTime(selectedDay, hour12, minute, isPm);
  }
  return applyPromotionalExpiresTime(selectedDay, 11, 59, true);
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Días anteriores a hoy no se pueden elegir en el calendario de expiración. */
export function isPromotionalExpiresCalendarDayDisabled(date: Date): boolean {
  return startOfLocalDay(date).getTime() < startOfLocalDay(new Date()).getTime();
}

/** Contador HH:MM:SS para las últimas 24 h. */
export function formatPromotionalCountdown(diffMs: number): string {
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Indica si algún código por tiempo está en la ventana de contador (< 24 h). */
export function promotionalCodesNeedLiveExpiryClock(
  codes: readonly PromotionalCodeRecord[],
  nowMs: number = Date.now(),
): boolean {
  return codes.some((row) => {
    if (row.expirationType !== "por_tiempo") return false;
    const end = parsePromotionalExpiresAt(row.expiresAt);
    if (!end) return false;
    const diffMs = end.getTime() - nowMs;
    return diffMs > 0 && diffMs < PROMOTIONAL_EXPIRY_COUNTDOWN_MS;
  });
}

/**
 * Tiempo restante legible para códigos por tiempo (sin decimales).
 * - Menos de 24 h: contador HH:MM:SS (actualizar en cliente cada ~10 s)
 * - Menos de 1 año: meses / semanas / días
 */
export function formatPromotionalCodeTimeRemaining(
  expiresAt: Date | string | unknown,
  nowMs: number = Date.now(),
): {
  primary: string;
  exactDate: string;
  expired: boolean;
  isCountdown: boolean;
} {
  const end = parsePromotionalExpiresAt(expiresAt);
  if (!end) {
    return { primary: "Sin fecha", exactDate: "—", expired: false, isCountdown: false };
  }

  const exactDate = formatExactDateEs(end);
  const diffMs = end.getTime() - nowMs;
  if (diffMs <= 0) {
    return { primary: "Expirado", exactDate, expired: true, isCountdown: false };
  }

  if (diffMs < PROMOTIONAL_EXPIRY_COUNTDOWN_MS) {
    return {
      primary: formatPromotionalCountdown(diffMs),
      exactDate,
      expired: false,
      isCountdown: true,
    };
  }

  const totalDays = Math.floor(diffMs / MS_PER_DAY);

  let primary: string;
  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    primary = years === 1 ? "1 año" : `${years} años`;
  } else if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    primary = months === 1 ? "1 mes" : `${months} meses`;
  } else if (totalDays >= 7) {
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    if (days === 0) {
      primary = weeks === 1 ? "1 semana" : `${weeks} semanas`;
    } else {
      const weekPart = weeks === 1 ? "1 semana" : `${weeks} semanas`;
      const dayPart = days === 1 ? "1 día" : `${days} días`;
      primary = `${weekPart} y ${dayPart}`;
    }
  } else {
    primary = totalDays === 1 ? "1 día" : `${totalDays} días`;
  }

  return { primary, exactDate, expired: false, isCountdown: false };
}

/** Texto de columna «Vence en» según tipo de expiración. */
export function formatPromotionalCodeExpiresColumn(
  row: PromotionalCodeRecord,
  nowMs: number = Date.now(),
): {
  primary: string;
  secondary?: string;
  isCountdown?: boolean;
} {
  if (row.expirationType === "por_usos") {
    const max = row.maxUses ?? 0;
    const used = row.usedCount ?? 0;
    const remaining = Math.max(0, max - used);
    return {
      primary: remaining === 1 ? "1 uso restante" : `${remaining} usos restantes`,
      secondary: `Límite: ${max} · Usados: ${used}`,
    };
  }

  if (!row.expiresAt) {
    return { primary: "Sin fecha" };
  }

  const { primary, exactDate, expired, isCountdown } = formatPromotionalCodeTimeRemaining(
    row.expiresAt,
    nowMs,
  );
  return {
    primary: expired ? "Expirado" : primary,
    secondary: exactDate,
    isCountdown,
  };
}
