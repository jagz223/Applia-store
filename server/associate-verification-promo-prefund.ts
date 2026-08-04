/**
 * Reglas de verificación cuando la cuota de visibilidad quedó cubierta por canje de meses gratis
 * antes de completar el flujo documental (cola admin + placeholders).
 */

import {
  hasVerificationCuotaSatisfiedByPromoPrefund,
  isAssociateOnboardingDossierComplete,
  isAssociateOnboardingVerificationDocsComplete,
  type PrefundPromoProviderSlice,
} from "@shared/professional-verification";
import { appliaStorage } from "./storage-applia";

const FREE_MONTHS_RECEIPT_PREFIX = "MES-GRATIS:";

function todayYyyyMmDdUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Tras subir identificación o documento profesional: si ya hay cuota por código promocional y ambos documentos,
 * deja el “comprobante” simbólico y la transacción en revisión para el panel admin.
 */
export async function ensurePromoPrefundedOnboardingQueuedForAdmin(userId: string): Promise<void> {
  const provider = await appliaStorage.getProviderByUserId(userId);
  const prof = await appliaStorage.getProfessionalVerificationByUserId(userId);
  const st = await appliaStorage.getVerifyingStatusByUserId(userId);

  if (isAssociateOnboardingDossierComplete(prof)) {
    await appliaStorage.clearVerifyingStatusPrefundPromoAwaitingDossier(userId);
    return;
  }

  if (!isAssociateOnboardingVerificationDocsComplete(prof)) return;
  if (!hasVerificationCuotaSatisfiedByPromoPrefund(provider as PrefundPromoProviderSlice | null)) return;

  const existingReceipt = String(prof?.transferReceiptCode ?? "").trim();
  if (existingReceipt && !existingReceipt.startsWith(FREE_MONTHS_RECEIPT_PREFIX)) {
    await appliaStorage.clearVerifyingStatusPrefundPromoAwaitingDossier(userId);
    return;
  }

  if (st?.transacction_verified === "pending" || st?.transacction_verified === "verified") {
    await appliaStorage.clearVerifyingStatusPrefundPromoAwaitingDossier(userId);
    return;
  }

  const promoCode = String((st as { prefundPromoCode?: string } | null)?.prefundPromoCode ?? "")
    .trim()
    .toUpperCase();
  const rawMonths = (st as { prefundPromoMonths?: unknown } | null)?.prefundPromoMonths;
  const promoMonths =
    typeof rawMonths === "number" && Number.isFinite(rawMonths)
      ? Math.max(1, Math.min(12, Math.trunc(rawMonths)))
      : 1;

  const day = todayYyyyMmDdUtc();
  const receiptCode = `${FREE_MONTHS_RECEIPT_PREFIX}${promoCode || "PROMO"} — ${promoMonths} mes${promoMonths === 1 ? "" : "es"} gratis (ticket promocional)`;
  await appliaStorage.mergeProfessionalVerificationFreeMonthsPrefundPlaceholder(userId, {
    transferReceiptCode: receiptCode,
    transferDate: day,
    subscriptionMonths: promoMonths,
    promotionalCode: promoCode || null,
  });
  await appliaStorage.upsertVerifyingStatusTransactionPending(userId, day, "onboarding");
  await appliaStorage.clearVerifyingStatusPrefundPromoAwaitingDossier(userId);
}
