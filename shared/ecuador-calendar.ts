/** Zona horaria usada para períodos de negocio (mes calendario en Ecuador). */
export const GENFEB_STATS_MONTH_TIMEZONE = "America/Guayaquil";

/**
 * Clave `YYYY-MM` del mes calendario en la zona indicada (p. ej. conteos mensuales de reservas).
 */
export function getCalendarMonthKeyInTimeZone(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

export function getGenfebStatsMonthKey(date = new Date()): string {
  return getCalendarMonthKeyInTimeZone(date, GENFEB_STATS_MONTH_TIMEZONE);
}
