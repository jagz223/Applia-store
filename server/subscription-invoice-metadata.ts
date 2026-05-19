import type { SubscriptionInvoicePaymentKind } from "@shared/subscription-invoice";

export type VerificationFinancialReportMeta = {
  subscriptionMonths?: number;
  subscriptionMonthlyUsd?: number;
  promotionalCode?: string | null;
  promotionalDiscountPercent?: number | null;
  subscriptionOriginalTotalUsd?: number | null;
  subscriptionDiscountedTotalUsd?: number | null;
  freeMonthsGranted?: number | null;
  paymentKind?: SubscriptionInvoicePaymentKind;
  transferReceiptCode?: string | null;
  transferDate?: string | null;
  approvedAt?: Date | string | null;
};

export function buildVerificationReportDescription(args: {
  months: number;
  transferReceiptCode?: string | null;
  promoCode?: string | null;
  promotionalDiscountPercent?: number | null;
  originalTotalUsd?: number | null;
  freeMonthsGranted?: number | null;
}): string {
  const months = Math.max(1, Math.trunc(args.months));
  if (args.freeMonthsGranted != null && args.freeMonthsGranted > 0) {
    const granted = Math.max(1, Math.trunc(args.freeMonthsGranted));
    const code = args.promoCode?.trim();
    return code
      ? `Meses gratuitos por código promocional ${code} (${granted} mes${granted === 1 ? "" : "es"})`
      : `Meses gratuitos por código promocional (${granted} mes${granted === 1 ? "" : "es"})`;
  }
  const base = `Pago por suscripción de visibilidad (${months} mes${months === 1 ? "" : "es"})`;
  const receipt = args.transferReceiptCode?.trim();
  const receiptPart = receipt ? ` (Comprobante: ${receipt})` : "";
  const code = args.promoCode?.trim();
  if (code && args.promotionalDiscountPercent != null) {
    const orig =
      args.originalTotalUsd != null && Number.isFinite(args.originalTotalUsd)
        ? `, antes ${args.originalTotalUsd.toFixed(2)} USD`
        : "";
    return `${base}${receiptPart} · Código promo ${code} (−${args.promotionalDiscountPercent}%${orig})`;
  }
  return `${base}${receiptPart}`;
}

export function invoiceNotesFromReport(report: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const purpose = String(report.description ?? "").trim();
  if (purpose) lines.push(`Concepto: ${purpose}`);

  const code = typeof report.promotionalCode === "string" ? report.promotionalCode.trim() : "";
  const kind = report.paymentKind as string | undefined;
  const freeMonths = report.freeMonthsGranted != null ? Number(report.freeMonthsGranted) : null;
  if (code && freeMonths != null && freeMonths > 0) {
    lines.push(`Código promocional ${code}: ${freeMonths} mes${freeMonths === 1 ? "" : "es"} activados sin cargo.`);
  } else if (code && report.promotionalDiscountPercent != null) {
    const pct = Number(report.promotionalDiscountPercent);
    const orig = report.subscriptionOriginalTotalUsd != null ? Number(report.subscriptionOriginalTotalUsd) : null;
    const paid = report.subscriptionDiscountedTotalUsd != null ? Number(report.subscriptionDiscountedTotalUsd) : Number(report.amount);
    if (Number.isFinite(pct)) {
      lines.push(
        `Código promocional ${code}: descuento del ${pct}%` +
          (orig != null && Number.isFinite(orig) ? ` (importe antes del descuento: ${orig.toFixed(2)} USD).` : ".") +
          (Number.isFinite(paid) ? ` Total pagado: ${paid.toFixed(2)} USD.` : ""),
      );
    }
  } else if (code) {
    lines.push(`Código promocional aplicado: ${code}`);
  }

  if (kind === "promo_free_months" && !code) {
    lines.push("Activación por meses gratuitos (código promocional).");
  }

  const months = report.subscriptionMonths != null ? Number(report.subscriptionMonths) : null;
  if (months != null && Number.isFinite(months) && months > 0 && kind !== "promo_free_months") {
    lines.push(`Periodo cubierto: ${months} mes${months === 1 ? "" : "es"} de visibilidad en Explorar.`);
  }

  const receipt = typeof report.transferReceiptCode === "string" ? report.transferReceiptCode.trim() : "";
  if (receipt) lines.push(`Referencia de transferencia: ${receipt}`);

  const transferDate = report.transferDate;
  if (transferDate) lines.push(`Fecha de transferencia registrada: ${String(transferDate)}`);

  const approvedAt = report.approvedAt ?? (report.status === "completed" ? report.updatedAt : null);
  if (approvedAt) {
    try {
      const d = approvedAt instanceof Date ? approvedAt : new Date(String(approvedAt));
      if (Number.isFinite(d.getTime())) {
        lines.push(
          `Fecha de aprobación del pago: ${d.toLocaleDateString("es-EC", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        );
      }
    } catch {
      /* ignore */
    }
  }

  return lines;
}

/** Mapea un reporte `verification_fee` al ítem de lista de facturas del cliente. */
export function mapVerificationFeeToInvoiceListItem(fee: Record<string, unknown>): Record<string, unknown> {
  const nid = fee.id != null ? Number(fee.id) : NaN;
  const reportKey = Number.isFinite(nid) ? nid : fee.id;
  const amt = fee.amount != null ? Number(fee.amount) : 0;
  const description = String(fee.description ?? "").trim();

  return {
    id: reportKey,
    reportId: reportKey,
    type: "verification",
    invoiceNumber: `VER-${reportKey}`,
    date: fee.createdAt ?? null,
    approvedAt: fee.approvedAt ?? (fee.status === "completed" ? fee.updatedAt : null) ?? null,
    service: description || "Suscripción de visibilidad en catálogo",
    amount: Number.isFinite(amt) ? amt : 0,
    status: fee.status ?? "pending",
    subscriptionMonths: fee.subscriptionMonths ?? null,
    subscriptionMonthlyUsd: fee.subscriptionMonthlyUsd ?? null,
    promotionalCode: fee.promotionalCode ?? null,
    promotionalDiscountPercent: fee.promotionalDiscountPercent ?? null,
    subscriptionOriginalTotalUsd: fee.subscriptionOriginalTotalUsd ?? null,
    subscriptionDiscountedTotalUsd: fee.subscriptionDiscountedTotalUsd ?? null,
    freeMonthsGranted: fee.freeMonthsGranted ?? null,
    paymentKind: fee.paymentKind ?? null,
    transferReceiptCode: fee.transferReceiptCode ?? null,
    transferDate: fee.transferDate ?? null,
  };
}
