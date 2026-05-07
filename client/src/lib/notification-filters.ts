/**
 * Oculta en la UI campana / historial todo lo referido a saldo GenFeb, recargas y retiros.
 * Debe coincidir con los tipos que el servidor deja de emitir cuando
 * SUPPRESS_GENFEB_WALLET_FLOW_NOTIFICATIONS está activo.
 */
const WALLET_NOTIFICATION_TYPES = new Set([
  "recharge_completed",
  "recharge_rejected",
  "balance_credited",
  "withdrawal_approved",
  "withdrawal_rejected",
]);

const ADMIN_WALLET_SUBTYPES = new Set(["recharge_pending", "withdrawal_requested", "withdrawal_processed_by_other"]);

export function isHiddenWalletRelatedNotification(n: { type: string; data?: Record<string, unknown> }): boolean {
  const t = n.type;
  if (WALLET_NOTIFICATION_TYPES.has(t)) return true;
  if (t === "admin") {
    const d = n.data ?? {};
    const sub = (d.type as string) ?? (d as { data?: { type?: string } }).data?.type;
    if (sub && ADMIN_WALLET_SUBTYPES.has(sub)) return true;
  }
  return false;
}

export function filterOutWalletRelatedNotifications<T extends { type: string; data?: Record<string, unknown> }>(
  list: T[]
): T[] {
  return list.filter((n) => !isHiddenWalletRelatedNotification(n));
}

/** Payload del canal `notification:admin` antes de mapear a type `admin`. */
export function isHiddenAdminWalletSocketPayload(raw: { type?: string } | null | undefined): boolean {
  const t = raw?.type;
  return t === "recharge_pending" || t === "withdrawal_requested" || t === "withdrawal_processed_by_other";
}
