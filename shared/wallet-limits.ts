import { calcCommission, roundToCents } from "./platform-commission";

/**
 * Piso mínimo de saldo (USD) en la billetera GenFeb para asociados y conductores
 * con pagos en efectivo/transferencia: no puede bajar de este valor; al alcanzarlo
 * se bloquean nuevos servicios salvo pago con saldo GenFeb.
 */
export const PROVIDER_WALLET_FLOOR_USD = -20;

export function isWalletAtOrBelowDebtCap(walletUsd: number | undefined | null): boolean {
  if (typeof walletUsd !== "number" || !Number.isFinite(walletUsd)) return true;
  return walletUsd <= PROVIDER_WALLET_FLOOR_USD;
}

/**
 * Tras descontar la comisión al proveedor (efectivo/transfer), el saldo no puede quedar por debajo del piso.
 */
export function canAffordOffPlatformCommission(
  providerWalletUsd: number,
  commissionUsd: number,
  floor: number = PROVIDER_WALLET_FLOOR_USD
): boolean {
  if (typeof providerWalletUsd !== "number" || !Number.isFinite(providerWalletUsd)) return false;
  if (typeof commissionUsd !== "number" || !Number.isFinite(commissionUsd)) return false;
  return roundToCents(providerWalletUsd - commissionUsd) >= floor;
}

export function minCommissionForEstimatedTrip(
  estimatedUsd: number,
  commissionRate: number
): number {
  const cost = roundToCents(estimatedUsd);
  if (cost <= 0) return 0;
  return calcCommission(cost, commissionRate);
}
