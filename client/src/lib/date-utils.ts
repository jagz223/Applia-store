/**
 * Indica si una fecha es anterior al día actual (solo compara día, no hora).
 * Útil para deshabilitar días pasados en calendarios de reserva.
 */
export function isBeforeToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

/** Valor que puede ser una fecha (API/Firestore). */
export type DateLike =
  | string
  | Date
  | number
  | { _seconds?: number; _nanoseconds?: number; toDate?: () => Date; toMillis?: () => number }
  | null
  | undefined;

/**
 * Convierte fecha devuelta por la API (string ISO, Date o Firestore Timestamp) a Date válido.
 * Firestore puede enviar Timestamp con toDate(), toMillis() o { _seconds, _nanoseconds }.
 */
export function toDate(value: DateLike | unknown): Date {
  if (value == null) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string") return new Date(value);
  const v = value as { toDate?: () => Date; toMillis?: () => number; _seconds?: number };
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.toMillis === "function") return new Date(v.toMillis());
  const sec = v._seconds;
  if (typeof sec === "number" && !Number.isNaN(sec)) return new Date(sec * 1000);
  return new Date(NaN);
}

/** Indica si la fecha resultante de toDate es válida. */
export function isValidDate(value: DateLike | unknown): boolean {
  const d = toDate(value);
  return !Number.isNaN(d.getTime());
}
