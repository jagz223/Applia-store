/** Reserva de servicio (no Car Go): efectivo o transferencia no pasan por el flujo de pago seguro en cartera. */
export function isOffPlatformServiceBookingPayment(method: string | undefined | null): boolean {
  return method === "cash" || method === "bank_transfer";
}

export function serviceBookingPaymentLabel(method: string | undefined | null): string {
  if (method === "cash") return "Efectivo";
  if (method === "bank_transfer") return "Transferencia bancaria";
  if (method === "wallet") return "Saldo Genfeb";
  return "Saldo Genfeb";
}
