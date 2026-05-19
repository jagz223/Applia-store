import { collectProviderGoBrandLabels } from "./admin-active-providers-directory";
import { getCategoryDisplayName } from "./default-categories";
import { getProviderCategoryIds } from "./provider-category-membership";

export type SubscriptionPaymentAuditMetaInput = {
  requestType?: "onboarding" | "renewal";
  provider?: {
    categoryId?: number | null;
    secondCategoryId?: number | null;
    thirdCategoryId?: number | null;
    category?: string | null;
    goBrands?: string[] | null;
  } | null;
  professionalVerification?: {
    subscriptionMonths?: number | null;
    subscriptionMonthlyUsd?: number | null;
    subscriptionOriginalTotalUsd?: number | null;
    subscriptionDiscountedTotalUsd?: number | null;
    promotionalCode?: string | null;
    promotionalDiscountPercent?: number | null;
  } | null;
  categories?: ReadonlyArray<{ id: number; slug?: string; name?: string }>;
  hasVehicle?: boolean;
  rejectReason?: string;
};

export type SubscriptionPaymentAuditMeta = {
  requestType?: "onboarding" | "renewal";
  subscriptionMonths?: number;
  subscriptionMonthlyUsd?: number;
  subscriptionOriginalTotalUsd?: number;
  subscriptionDiscountedTotalUsd?: number;
  subscriptionTotalUsd?: number;
  promotionalCode?: string | null;
  promotionalDiscountPercent?: number | null;
  hasDiscount?: boolean;
  providerCategorySlug?: string | null;
  categoryDisplayName?: string | null;
  categorySlotLabels?: string[];
  goBrandLabels?: string[];
  reason?: string;
};

export function buildSubscriptionPaymentAuditMeta(
  input: SubscriptionPaymentAuditMetaInput,
): SubscriptionPaymentAuditMeta {
  const prof = input.professionalVerification;
  const provider = input.provider;
  const categories = input.categories ?? [];

  const months =
    typeof prof?.subscriptionMonths === "number" && Number.isFinite(prof.subscriptionMonths)
      ? Math.max(1, Math.min(12, Math.trunc(prof.subscriptionMonths)))
      : undefined;
  const monthlyUsd =
    typeof prof?.subscriptionMonthlyUsd === "number" && Number.isFinite(prof.subscriptionMonthlyUsd)
      ? Math.max(0, Number(prof.subscriptionMonthlyUsd))
      : undefined;
  const originalTotal =
    typeof prof?.subscriptionOriginalTotalUsd === "number" && Number.isFinite(prof.subscriptionOriginalTotalUsd)
      ? Number(prof.subscriptionOriginalTotalUsd)
      : months != null && monthlyUsd != null
        ? Math.round(months * monthlyUsd * 100) / 100
        : undefined;
  const discountedTotal =
    typeof prof?.subscriptionDiscountedTotalUsd === "number" && Number.isFinite(prof.subscriptionDiscountedTotalUsd)
      ? Number(prof.subscriptionDiscountedTotalUsd)
      : undefined;
  const promotionalCode =
    typeof prof?.promotionalCode === "string" ? prof.promotionalCode.trim() || null : null;
  const promotionalDiscountPercent =
    typeof prof?.promotionalDiscountPercent === "number" && Number.isFinite(prof.promotionalDiscountPercent)
      ? Number(prof.promotionalDiscountPercent)
      : null;
  const hasDiscount =
    discountedTotal != null &&
    originalTotal != null &&
    Math.abs(discountedTotal - originalTotal) > 0.009;
  const subscriptionTotalUsd = discountedTotal ?? originalTotal;

  const categorySlotLabels: string[] = [];
  const catIds = provider ? getProviderCategoryIds(provider) : [];
  for (const cid of catIds) {
    const row = categories.find((c) => Number(c.id) === Number(cid));
    const label = getCategoryDisplayName(row ?? null);
    if (label && !categorySlotLabels.includes(label)) categorySlotLabels.push(label);
  }

  const primaryCatId = Number(provider?.categoryId);
  const primaryRow = Number.isFinite(primaryCatId)
    ? categories.find((c) => Number(c.id) === primaryCatId)
    : undefined;
  const providerCategorySlug =
    (primaryRow as { slug?: string } | undefined)?.slug ??
    (provider?.category ? String(provider.category).trim() : null) ??
    null;

  const goBrandLabels = provider
    ? collectProviderGoBrandLabels(provider, categories, Boolean(input.hasVehicle))
    : [];

  return {
    requestType: input.requestType,
    ...(months != null ? { subscriptionMonths: months } : {}),
    ...(monthlyUsd != null ? { subscriptionMonthlyUsd: monthlyUsd } : {}),
    ...(originalTotal != null ? { subscriptionOriginalTotalUsd: originalTotal } : {}),
    ...(discountedTotal != null ? { subscriptionDiscountedTotalUsd: discountedTotal } : {}),
    ...(subscriptionTotalUsd != null ? { subscriptionTotalUsd } : {}),
    promotionalCode,
    promotionalDiscountPercent,
    ...(hasDiscount ? { hasDiscount: true } : {}),
    providerCategorySlug,
    categoryDisplayName: primaryRow ? getCategoryDisplayName(primaryRow) : null,
    ...(categorySlotLabels.length > 0 ? { categorySlotLabels } : {}),
    ...(goBrandLabels.length > 0 ? { goBrandLabels } : {}),
    ...(input.rejectReason ? { reason: input.rejectReason } : {}),
  };
}

/** Líneas de detalle para el historial de auditoría (UI admin). */
export function formatSubscriptionPaymentAuditSummary(
  meta: Record<string, unknown> | null | undefined,
): string[] {
  if (!meta || typeof meta !== "object") return [];
  const lines: string[] = [];

  const requestType = String(meta.requestType ?? "").trim();
  if (requestType === "renewal") lines.push("Tipo: renovación de suscripción");
  else if (requestType === "onboarding") lines.push("Tipo: alta de asociado");

  const months = meta.subscriptionMonths;
  const total = meta.subscriptionTotalUsd;
  const original = meta.subscriptionOriginalTotalUsd;
  const discounted = meta.subscriptionDiscountedTotalUsd;
  const hasDiscount = meta.hasDiscount === true;
  const promoCode = meta.promotionalCode != null ? String(meta.promotionalCode).trim() : "";
  const promoPct = meta.promotionalDiscountPercent;

  if (typeof months === "number" && Number.isFinite(months)) {
    const monthLabel = months === 1 ? "1 mes" : `${months} meses`;
    if (typeof total === "number" && Number.isFinite(total)) {
      if (hasDiscount && typeof original === "number" && Number.isFinite(original)) {
        lines.push(
          `Pago: ${monthLabel} · $${total.toFixed(2)} USD (antes $${original.toFixed(2)} USD)`,
        );
        const promoParts: string[] = [];
        if (promoCode) promoParts.push(`código ${promoCode}`);
        if (typeof promoPct === "number" && Number.isFinite(promoPct)) promoParts.push(`${promoPct}% dto.`);
        if (promoParts.length > 0) lines.push(`Descuento: ${promoParts.join(" · ")}`);
      } else {
        lines.push(`Pago: ${monthLabel} · $${total.toFixed(2)} USD (sin descuento)`);
      }
    } else {
      lines.push(`Meses pagados: ${monthLabel}`);
    }
  } else if (typeof total === "number" && Number.isFinite(total)) {
    lines.push(`Monto: $${total.toFixed(2)} USD`);
  }

  const slotLabels = meta.categorySlotLabels;
  if (Array.isArray(slotLabels) && slotLabels.length > 0) {
    lines.push(`Categoría: ${slotLabels.map(String).join(" · ")}`);
  } else if (meta.categoryDisplayName) {
    lines.push(`Categoría: ${String(meta.categoryDisplayName)}`);
  }

  const goLabels = meta.goBrandLabels;
  if (Array.isArray(goLabels) && goLabels.length > 0) {
    lines.push(`Go / conducción: ${goLabels.map(String).join(" · ")}`);
  }

  const reason = meta.reason != null ? String(meta.reason).trim() : "";
  if (reason) lines.push(`Motivo rechazo: ${reason}`);

  return lines;
}
