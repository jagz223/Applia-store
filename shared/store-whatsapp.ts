/** Normaliza teléfono para wa.me (solo dígitos, sin +). */
export function normalizeStoreWhatsappPhone(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;

  // Casos comunes donde guardamos el teléfono sin prefijo internacional:
  // - Venezuela (móvil): números tipo 04xx..., por ejemplo 0414xxxxxxx
  // wa.me espera formato internacional sin '+': 58414xxxxxxx
  if (digits.length === 11 && digits.startsWith("04")) {
    digits = `58${digits.slice(1)}`;
  }

  return digits;
}

export function formatStoreWhatsappDisplay(raw: string | null | undefined): string | null {
  const e164 = normalizeStoreWhatsappPhone(raw);
  if (!e164) return null;
  if (e164.length === 12 && e164.startsWith("593")) {
    return `+${e164.slice(0, 3)} ${e164.slice(3, 5)} ${e164.slice(5, 8)} ${e164.slice(8)}`;
  }
  return `+${e164}`;
}

export function buildStoreWhatsappUrl(
  raw: string | null | undefined,
  message?: string | null,
): string | null {
  const phone = normalizeStoreWhatsappPhone(raw);
  if (!phone) return null;
  const base = `https://wa.me/${phone}`;
  const text = String(message ?? "").trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
