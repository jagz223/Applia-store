export const PLATFORM_COMMISSION_RATE = 0.1;

/** Redondea a 2 decimales (centavos) para evitar errores de floating point. */
export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcCommission(amount: number, rate: number = PLATFORM_COMMISSION_RATE): number {
  return roundToCents(amount * rate);
}

export function calcProviderNet(amount: number, rate: number = PLATFORM_COMMISSION_RATE): number {
  const commission = calcCommission(amount, rate);
  return roundToCents(amount - commission);
}

