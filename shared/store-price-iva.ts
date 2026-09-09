/** IVA aplicado a precios de vitrina / cobro (no se guarda en el producto). */
export const STORE_IVA_RATE = 0.16;

/** Precio + 16 %, redondeado a 2 decimales (p. ej. 17.563 → 17.57). */
export function priceWithIva(amount: number, rate = STORE_IVA_RATE): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * (1 + rate) * 100) / 100;
}

/** Aplica IVA a un mapa de precios por moneda. */
export function pricesByCurrencyWithIva(
  map: Record<string, number> | undefined,
  rate = STORE_IVA_RATE,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(map ?? {})) {
    out[id] = priceWithIva(value, rate);
  }
  return out;
}
