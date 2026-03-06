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
