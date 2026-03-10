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

/**
 * Convierte fecha devuelta por la API (string ISO, Date o Firestore Timestamp) a Date válido.
 * Firestore serializa timestamps como { _seconds, _nanoseconds }.
 */
export function toDate(
  value: string | Date | { _seconds?: number; _nanoseconds?: number } | null | undefined
): Date {
  if (value == null) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  const sec = (value as { _seconds?: number })._seconds;
  if (typeof sec === "number" && !Number.isNaN(sec)) return new Date(sec * 1000);
  return new Date();
}
