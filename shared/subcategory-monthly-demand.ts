/**
 * Si al pasar de `previousStatus` a `nextStatus` debemos sumar 1 al contador mensual
 * de demanda por subcategoría (solo una vez por reserva: confirmada o completada).
 */
export function bookingTransitionCountsForMonthlySubcategoryDemand(
  previousStatus: string | undefined | null,
  nextStatus: string | undefined | null,
  alreadyCounted: boolean | undefined
): boolean {
  if (alreadyCounted === true) return false;
  const prev = String(previousStatus ?? "pending").trim();
  const next = String(nextStatus ?? "").trim();
  if (next !== "confirmed" && next !== "completed") return false;
  if (prev === "confirmed" || prev === "completed") return false;
  return true;
}
