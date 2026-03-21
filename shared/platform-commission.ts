export const PLATFORM_COMMISSION_RATE = 0.1;

/** Porcentajes enteros para textos (p. ej. plataforma 10 %, asociado 90 %). */
export function commissionDisplayPercents(rate: number): { platformPercent: number; providerPercent: number } {
  const platformPercent = Math.round(rate * 100);
  const providerPercent = Math.max(0, Math.min(100, 100 - platformPercent));
  return { platformPercent, providerPercent };
}

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

