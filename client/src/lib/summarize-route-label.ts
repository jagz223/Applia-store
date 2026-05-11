/**
 * Acorta etiquetas de dirección (geocodificación) para listas y tarjetas en pantalla pequeña.
 * La cadena completa puede mostrarse en `title` o en un mapa / modal.
 */
export function summarizeRouteLabel(full: string, maxChars = 52): string {
  const normalized = full.replace(/\s+/g, " ").trim();
  if (!normalized) return "—";
  if (normalized.length <= maxChars) return normalized;
  const slice = normalized.slice(0, maxChars);
  const lastComma = slice.lastIndexOf(",");
  if (lastComma > 16) {
    return `${slice.slice(0, lastComma).trimEnd()}…`;
  }
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 20 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}
