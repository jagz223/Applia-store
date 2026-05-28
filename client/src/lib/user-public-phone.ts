/** Teléfono público para coordinación en viajes Go (varios nombres de campo en Firestore). */
export function extractUserPublicPhone(
  rec: Record<string, unknown> | null | undefined,
): string {
  if (!rec) return "";
  return String(
    rec.phone ?? rec.phoneNumber ?? rec.phone_number ?? rec.phone_number_e164 ?? "",
  ).trim();
}
