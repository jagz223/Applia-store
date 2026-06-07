/** Metadatos de factura / reporte por suscripción de visibilidad (asociado). */

export type SubscriptionInvoicePaymentKind =
  | "subscription_transfer"
  | "store_subscription_transfer"
  | "promo_free_months"
  | "promo_discount"
  | "unknown";

export type SubscriptionInvoiceListItem = {
  id?: number;
  reportId?: number;
  type: string;
  invoiceNumber?: string;
  service?: string;
  amount?: number | string;
  status?: string;
  date?: string | null;
  approvedAt?: string | null;
  subscriptionMonths?: number | null;
  subscriptionMonthlyUsd?: number | null;
  promotionalCode?: string | null;
  promotionalDiscountPercent?: number | null;
  subscriptionOriginalTotalUsd?: number | null;
  subscriptionDiscountedTotalUsd?: number | null;
  freeMonthsGranted?: number | null;
  paymentKind?: SubscriptionInvoicePaymentKind | null;
  transferReceiptCode?: string | null;
  transferDate?: string | null;
};

export function parseSubscriptionInvoiceAmount(raw: unknown, fallback = 0): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function inferSubscriptionPaymentKind(row: SubscriptionInvoiceListItem): SubscriptionInvoicePaymentKind {
  if (row.paymentKind) return row.paymentKind;
  if (row.freeMonthsGranted != null && row.freeMonthsGranted > 0) return "promo_free_months";
  if (row.promotionalCode && row.promotionalDiscountPercent != null) return "promo_discount";
  const desc = String(row.service ?? "").toLowerCase();
  if (desc.includes("meses gratuitos") || desc.includes("código promocional")) return "promo_free_months";
  if (desc.includes("código promo") || desc.includes("codigo promo")) return "promo_discount";
  if (desc.includes("tienda") && (desc.includes("suscripción") || desc.includes("suscripcion"))) {
    return "store_subscription_transfer";
  }
  if (desc.includes("suscripción") || desc.includes("suscripcion") || desc.includes("visibilidad")) {
    return "subscription_transfer";
  }
  return "unknown";
}

export function subscriptionInvoicePurposeLabel(row: SubscriptionInvoiceListItem): string {
  const kind = inferSubscriptionPaymentKind(row);
  const months = row.subscriptionMonths;
  if (kind === "store_subscription_transfer") {
    const m = months ?? 1;
    return `Mensualidad de tienda (${m} mes${m === 1 ? "" : "es"})`;
  }
  if (kind === "promo_free_months") {
    const granted = row.freeMonthsGranted ?? months ?? 1;
    return `Meses gratuitos por código promocional (${granted} mes${granted === 1 ? "" : "es"})`;
  }
  if (kind === "promo_discount" || (row.promotionalCode && row.promotionalDiscountPercent != null)) {
    const m = months ?? 1;
    return `Suscripción de visibilidad (${m} mes${m === 1 ? "" : "es"}) con descuento promocional`;
  }
  if (months != null && months > 0) {
    return `Suscripción de visibilidad en catálogo (${months} mes${months === 1 ? "" : "es"})`;
  }
  return row.service ?? "Suscripción de visibilidad en catálogo";
}

export function subscriptionInvoicePromoSummary(row: SubscriptionInvoiceListItem): string | null {
  const kind = inferSubscriptionPaymentKind(row);
  const code = row.promotionalCode?.trim();
  if (!code) return null;
  if (kind === "promo_free_months") {
    const granted = row.freeMonthsGranted ?? row.subscriptionMonths ?? 1;
    return `Código ${code}: se activaron ${granted} mes${granted === 1 ? "" : "es"} gratis (sin transferencia).`;
  }
  if (row.promotionalDiscountPercent != null) {
    const orig = row.subscriptionOriginalTotalUsd;
    const disc = row.subscriptionDiscountedTotalUsd ?? parseSubscriptionInvoiceAmount(row.amount);
    const origStr = orig != null ? ` · Antes: ${orig.toFixed(2)} USD` : "";
    return `Código ${code}: −${row.promotionalDiscountPercent}%${origStr} · Total pagado: ${disc.toFixed(2)} USD`;
  }
  return `Código promocional: ${code}`;
}

export function subscriptionInvoiceStatusLabel(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "Aprobado";
    case "rejected":
      return "Rechazado";
    case "pending":
      return "Pendiente de revisión";
    default:
      return status ?? "—";
  }
}
