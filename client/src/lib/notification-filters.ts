/**
 * Oculta en la UI campana / historial todo lo referido a saldo, recargas, retiros y avisos
 * de escrow/comisión ligados al wallet (producto sin flujo de monedero activo).
 */
const WALLET_NOTIFICATION_TYPES = new Set([
  "recharge_completed",
  "recharge_rejected",
  "balance_credited",
  "withdrawal_approved",
  "withdrawal_rejected",
  "booking_confirmed_by_client",
  "booking_cost_commission_reminder",
]);

const ADMIN_WALLET_SUBTYPES = new Set(["recharge_pending", "withdrawal_requested", "withdrawal_processed_by_other"]);

export function isHiddenWalletRelatedNotification(n: { type: string; data?: Record<string, unknown> }): boolean {
  const t = n.type;
  if (WALLET_NOTIFICATION_TYPES.has(t)) return true;
  if (t === "verification_result") {
    const d = n.data ?? {};
    const step = String((d.step as string | undefined) ?? (d as { data?: { step?: string } }).data?.step ?? "");
    if (step === "transaction") return true;
  }
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
