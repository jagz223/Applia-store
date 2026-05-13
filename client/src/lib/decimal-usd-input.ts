/**
 * Entrada de montos USD en inputs: solo dígitos y separadores decimales (`.` y `,`).
 * Evita NaN y permite escribir decimales paso a paso (p. ej. `0.` antes de `5`).
 */

/** Quita todo lo que no sea dígito o separador; fusiona varios `.` en un solo decimal. */
export function sanitizeDecimalUsdInput(raw: string): string {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!s) return "";
  s = s.replace(/,/g, ".");
  const parts = s.split(".");
  if (parts.length === 1) return parts[0] ?? "";
  return (parts[0] ?? "") + "." + parts.slice(1).join("");
}

/** `0.`, `12.` o solo `.` — el usuario aún está escribiendo el decimal. */
export function isTrailingDecimalUsdIncomplete(sanitized: string): boolean {
  const t = String(sanitized ?? "").trim();
  return t !== "" && /^\d*\.$/.test(t);
}

/**
 * Convierte texto saneado a número finito, o `undefined` si está vacío, es solo `.`
 * o termina en `.` (valor aún incompleto: no usar `parseFloat("0.") === 0` en estado).
 */
export function parseDecimalUsdInputToNumber(sanitized: string): number | undefined {
  const t = String(sanitized ?? "").trim();
  if (t === "" || t === ".") return undefined;
  if (isTrailingDecimalUsdIncomplete(t)) return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Valor mostrado en `<Input />` (número o cadena intermedia tipo `0.`). */
export function usdAmountInputDisplay(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Interpreta borrador guardado (número o string incompleta) para merge/guardado.
 * Las cadenas que solo terminan en `.` no cuentan como número válido.
 */
export function coerceUsdDraftValueToNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return undefined;
    if (isTrailingDecimalUsdIncomplete(t)) return undefined;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
